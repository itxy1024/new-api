package controller

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// 使用登录态复用生图 relay，浏览器不需要接触任何 API Key。
func CreativeImage(c *gin.Context) {
	Relay(c, types.RelayFormatOpenAIImage)
}

// 在分发中间件前建立登录态令牌上下文。
func PrepareCreativeImageContext(c *gin.Context) {
	if err := prepareCreativeContext(c); err != nil {
		writeCreativeError(c, err, http.StatusBadRequest)
		c.Abort()
		return
	}
	c.Request.URL.Path = "/v1/images/generations"
	c.Request.RequestURI = c.Request.URL.Path
	c.Next()
}

// CreativeModels 返回当前用户指定 API Key 可用的模型列表。
func CreativeModels(c *gin.Context) {
	if err := prepareCreativeKeyContext(c, c.Query("key_id")); err != nil {
		writeCreativeError(c, err, http.StatusBadRequest)
		return
	}
	groups := []string{}
	if raw, ok := common.GetContextKey(c, constant.ContextKeyTokenGroups); ok {
		groups, _ = raw.([]string)
	}
	if len(groups) == 0 {
		groups = []string{common.GetContextKeyString(c, constant.ContextKeyUsingGroup)}
	}
	expandedGroups := make([]string, 0, len(groups))
	for _, group := range groups {
		if group == "auto" {
			userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
			expandedGroups = append(expandedGroups, service.GetRequestAutoGroups(c, userGroup)...)
			continue
		}
		expandedGroups = append(expandedGroups, group)
	}
	seen := make(map[string]bool)
	models := make([]gin.H, 0)
	for _, group := range expandedGroups {
		if strings.TrimSpace(group) == "" {
			continue
		}
		for _, name := range model.GetGroupEnabledModels(group) {
			key := group + "\x00" + name
			if seen[key] {
				continue
			}
			seen[key] = true
			models = append(models, gin.H{"id": name, "group": group})
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": models, "object": "list"})
}

// 使用登录态复用视频任务 relay，厂商适配由后台渠道决定。
func CreativeVideo(c *gin.Context) {
	RelayTask(c)
}

// 在任务插件路由前建立登录态令牌上下文。
func PrepareCreativeVideoContext(c *gin.Context) {
	if err := prepareCreativeContext(c); err != nil {
		writeCreativeError(c, err, http.StatusBadRequest)
		c.Abort()
		return
	}
	c.Request.URL.Path = "/v1/video/generations"
	c.Request.RequestURI = c.Request.URL.Path
	c.Next()
}

// 返回 OpenAI 视频任务状态格式。
func CreativeVideoFetch(c *gin.Context) {
	keyID := ""
	if task, exists, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id")); err == nil && exists && task != nil && task.PrivateData.TokenId > 0 {
		keyID = strconv.Itoa(task.PrivateData.TokenId)
	}
	if err := prepareCreativeKeyContext(c, keyID); err != nil {
		writeCreativeError(c, err, http.StatusBadRequest)
		return
	}
	c.Request.URL.Path = "/v1/video/generations/" + c.Param("task_id")
	c.Request.RequestURI = c.Request.URL.Path
	RelayTaskFetch(c)
}

// 通过现有的视频内容安全代理返回结果。
func CreativeVideoContent(c *gin.Context) {
	task, exists, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id"))
	if err != nil || !exists || task == nil {
		writeCreativeError(c, errors.New("task not found"), http.StatusNotFound)
		return
	}
	keyID := ""
	if task.PrivateData.TokenId > 0 {
		keyID = strconv.Itoa(task.PrivateData.TokenId)
	}
	if err := prepareCreativeKeyContext(c, keyID); err != nil {
		writeCreativeError(c, err, http.StatusBadRequest)
		return
	}
	c.Request.URL.Path = "/v1/videos/" + c.Param("task_id") + "/content"
	c.Request.RequestURI = c.Request.URL.Path
	VideoProxy(c)
}

func prepareCreativeContext(c *gin.Context) error {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return errors.New("failed to read creative request")
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	var envelope struct {
		KeyID int `json:"key_id"`
		Group string `json:"group"`
	}
	if len(body) > 0 && common.Unmarshal(body, &envelope) != nil {
		return errors.New("invalid creative request")
	}
	if envelope.KeyID <= 0 {
		return errors.New("creative key_id is required")
	}
	if err := prepareCreativeKeyContext(c, strconv.Itoa(envelope.KeyID)); err != nil {
		return err
	}
	if strings.TrimSpace(envelope.Group) != "" {
		return setCreativeGroup(c, envelope.Group)
	}
	return nil
}

func prepareCreativeKeyContext(c *gin.Context, requestedKeyID string) error {
	user, err := model.GetUserCache(c.GetInt("id"))
	if err != nil || user == nil {
		return errors.New("user not found")
	}
	keyID, err := strconv.Atoi(strings.TrimSpace(requestedKeyID))
	if err != nil || keyID <= 0 {
		return errors.New("creative key_id is required")
	}
	token, err := model.GetTokenByIds(keyID, user.Id)
	if err != nil || token == nil {
		return errors.New("creative key is not available")
	}
	if token.Status != common.TokenStatusEnabled {
		return errors.New("creative key is disabled")
	}
	user.WriteContext(c)
	// 临时上下文只承载用户选择的 Key，不向浏览器返回真实 Key。
	if err := middleware.SetupContextForToken(c, token); err != nil {
		return err
	}
	// 普通 TokenAuth 会在 SetupContextForToken 前设置 using_group；创作中心
	// 直接从登录态进入，因此这里必须同步所选 Key 的分组，否则分发器会
	// 回退到用户默认分组。
	usingGroup := token.Group
	if groups := token.GetGroups(); len(groups) > 0 {
		usingGroup = groups[0]
	}
	if strings.TrimSpace(usingGroup) == "" {
		usingGroup = user.Group
	}
	common.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)
	return nil
}

func setCreativeGroup(c *gin.Context, requested string) error {
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return nil
	}
	if requested == "auto" {
		common.SetContextKey(c, constant.ContextKeyUsingGroup, requested)
		return nil
	}
	raw, ok := common.GetContextKey(c, constant.ContextKeyTokenGroups)
	if groups, valid := raw.([]string); ok && valid && len(groups) > 0 {
		for _, group := range groups {
			if group == requested {
				common.SetContextKey(c, constant.ContextKeyUsingGroup, requested)
				common.SetContextKey(c, constant.ContextKeyTokenGroup, requested)
				// 分发器在 Token 配置了多个分组时会按 token_groups 自动匹配模型。
				// 创作中心已经明确选择了分组，此处收窄本次请求的候选分组，
				// 避免同名模型被错误路由到 default 或其他分组。
				common.SetContextKey(c, constant.ContextKeyTokenGroups, []string{requested})
				return nil
			}
		}
		return errors.New("creative group is not available for this key")
	}
	if requested != common.GetContextKeyString(c, constant.ContextKeyUsingGroup) {
		return errors.New("creative group is not available for this key")
	}
	return nil
}

func writeCreativeError(c *gin.Context, err error, status int) {
	c.JSON(status, gin.H{"error": gin.H{
		"message": err.Error(),
		"type":    "invalid_request_error",
		"code":    "creative_request_failed",
	}})
}
