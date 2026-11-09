package model

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
)

func (token Token) cacheMAC() (string, error) {
	key := getTokenCacheKey(token.Key)
	token.Key = ""
	token.RemainQuota = 0
	token.UsedQuota = 0
	token.AccessedTime = 0
	if token.AllowIps != nil && *token.AllowIps == "" {
		token.AllowIps = nil
	}
	return authCacheMAC(key, struct {
		Token          Token
		AutoGroups     string
		CacheExpiresAt int64
	}{token, token.AutoGroups, token.CacheExpiresAt})
}

func getTokenCacheKey(key string) string {
	return fmt.Sprintf("token:%s", common.GenerateHMAC(key))
}

// The fence uses the cache key as its hash tag so cacheInitToken's script
// reads both keys from one slot on sharded Redis.
func getTokenCacheFenceKey(key string) string {
	return fmt.Sprintf("token:fence:{%s}", getTokenCacheKey(key))
}

func tokenCacheTTLSeconds() int {
	ttl := common.RedisKeyCacheSeconds()
	if ttl <= 0 {
		return 60
	}
	return ttl
}

// tokenCacheFenceSeconds must outlive a token mutation's database write plus
// any in-flight reader's DB-read-to-cache-init gap. The fence is not deleted
// after commit; it expires naturally so a reader holding a pre-mutation
// snapshot cannot publish it right after the mutation cleared the cache.
// While the fence exists readers simply serve the database without caching.
const tokenCacheFenceSeconds = 10

const tokenCacheSchemaVersion = "4"

// invalidateTokenCacheForMutation is called before a token metadata mutation
// writes to the database: it raises the fence and drops the cached hash so no
// reader can act on (or re-publish) the pre-mutation state.
func invalidateTokenCacheForMutation(key string) error {
	if !common.RedisEnabled || key == "" {
		return nil
	}
	ctx := context.Background()
	err := common.RDB.Set(ctx, getTokenCacheFenceKey(key), 1, time.Duration(tokenCacheFenceSeconds)*time.Second).Err()
	if err != nil {
		return err
	}
	return common.RDB.Del(ctx, getTokenCacheKey(key)).Err()
}

// cacheInitToken publishes database metadata when the hash is cold or fails
// verification. Existing quota counters survive repairs because pre-consume
// can update Redis before the database catches up; counters that are no
// longer integers are replaced from the snapshot.
// Returns 0 when fenced, 1 after initialization, or 2 for an existing hash.
func cacheInitToken(token Token) (int, error) {
	if !common.RedisEnabled {
		return 0, nil
	}
	allowIps := ""
	if token.AllowIps != nil {
		allowIps = *token.AllowIps
	}
	groups, err := common.Marshal(token.Groups)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal token groups: %w", err)
	}
	cacheKey := getTokenCacheKey(token.Key)
	var existing Token
	cached, readErr := cacheGetTokenByKey(token.Key)
	if readErr == nil {
		existing = *cached
	} else {
		// 校验失败时只读取旧签名，Lua 用它防止覆盖并发写入的新元数据。
		existing.CacheMAC, _ = common.RDB.HGet(context.Background(), cacheKey, "CacheMAC").Result()
	}
	repair := readErr != nil
	token.CacheExpiresAt = time.Now().Add(time.Duration(tokenCacheTTLSeconds()) * time.Second).UnixMilli()
	mac, err := token.cacheMAC()
	if err != nil {
		return 0, err
	}
	const script = `
if redis.call('EXISTS', KEYS[2]) == 1 then
  return 0
end
local exists = redis.call('EXISTS', KEYS[1])
if exists == 1 and (ARGV[21] ~= 'true' or (redis.call('HGET', KEYS[1], 'CacheMAC') or '') ~= ARGV[22]) then
  redis.call('EXPIRE', KEYS[1], ARGV[18])
  return 2
end
redis.call('HDEL', KEYS[1], 'DeletedAt')
redis.call('HSET', KEYS[1],
  'Id', ARGV[1], 'UserId', ARGV[2], 'Status', ARGV[3], 'Name', ARGV[4],
  'CreatedTime', ARGV[5], 'ExpiredTime', ARGV[7],
  'UnlimitedQuota', ARGV[8], 'ModelLimitsEnabled', ARGV[9], 'ModelLimits', ARGV[10],
  'AllowIps', ARGV[11], 'Group', ARGV[12], 'CrossGroupRetry', ARGV[13],
  'AutoGroups', ARGV[14], 'AllowUserQuotaQuery', ARGV[17],
  'CacheExpiresAt', ARGV[19], 'CacheMAC', ARGV[20],
  'GroupsJSON', ARGV[23], 'GroupAggregationEnabled', ARGV[24], 'SchemaVersion', ARGV[25])
for _, counter in ipairs({{'AccessedTime', ARGV[6]}, {'RemainQuota', ARGV[15]}, {'UsedQuota', ARGV[16]}}) do
  if not string.match(redis.call('HGET', KEYS[1], counter[1]) or '', '^-?%d+$') then
    redis.call('HSET', KEYS[1], counter[1], counter[2])
  end
end
redis.call('EXPIRE', KEYS[1], ARGV[18])
if exists == 1 then
  return 2
end
return 1`

	return common.RDB.Eval(context.Background(), script, []string{
		cacheKey, getTokenCacheFenceKey(token.Key),
	},
		token.Id, token.UserId, token.Status, token.Name,
		token.CreatedTime, token.AccessedTime, token.ExpiredTime,
		strconv.FormatBool(token.UnlimitedQuota), strconv.FormatBool(token.ModelLimitsEnabled),
		token.ModelLimits, allowIps, token.Group, strconv.FormatBool(token.CrossGroupRetry),
		token.AutoGroups, token.RemainQuota, token.UsedQuota,
		strconv.FormatBool(token.AllowUserQuotaQuery),
		tokenCacheTTLSeconds(),
		token.CacheExpiresAt, mac, strconv.FormatBool(repair), existing.CacheMAC,
		string(groups), strconv.FormatBool(token.GroupAggregationEnabled), tokenCacheSchemaVersion,
	).Int()
}

// cacheGetTokenByKey 从缓存读取 token；不完整的哈希（如仅有配额字段）会被拒绝。
func cacheGetTokenByKey(key string) (*Token, error) {
	if !common.RedisEnabled {
		return nil, fmt.Errorf("redis is not enabled")
	}
	var token Token
	if err := common.RedisHGetObj(getTokenCacheKey(key), &token); err != nil {
		return nil, err
	}
	if token.Id <= 0 {
		return nil, fmt.Errorf("token cache is incomplete")
	}
	metadata, err := common.RDB.HMGet(context.Background(), getTokenCacheKey(key),
		"SchemaVersion", "GroupsJSON", "AllowUserQuotaQuery").Result()
	if err != nil {
		return nil, fmt.Errorf("failed to load token cache metadata: %w", err)
	}
	if len(metadata) != 3 || metadata[0] != tokenCacheSchemaVersion {
		return nil, fmt.Errorf("token cache schema is outdated")
	}
	groupsJSON, ok := metadata[1].(string)
	if !ok {
		return nil, fmt.Errorf("token cache groups are incomplete")
	}
	if err := common.UnmarshalJsonStr(groupsJSON, &token.Groups); err != nil {
		return nil, fmt.Errorf("failed to parse token cache groups: %w", err)
	}
	allowUserQuotaQuery, ok := metadata[2].(string)
	if !ok {
		return nil, fmt.Errorf("token cache quota query setting is incomplete")
	}
	token.AllowUserQuotaQuery = allowUserQuotaQuery == "true"
	token.Key = key
	mac, err := token.cacheMAC()
	if err != nil || !validAuthCacheMAC(mac, token.CacheMAC, token.CacheExpiresAt) {
		return nil, fmt.Errorf("token cache integrity check failed")
	}
	return &token, nil
}
