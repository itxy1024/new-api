package system_setting

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
)

const (
	TaskArtifactStoreModeUpstream = "upstream"
	TaskArtifactStoreModeS3       = "s3"

	DefaultTaskArtifactStorePresignTTLSeconds = 900
	MaxTaskArtifactStorePresignTTLSeconds     = 7 * 24 * 60 * 60
)

const (
	TaskArtifactStoreModeOption         = "TaskArtifactStoreMode"
	TaskArtifactStoreS3EndpointOption   = "TaskArtifactStoreS3Endpoint"
	TaskArtifactStoreS3BucketOption     = "TaskArtifactStoreS3Bucket"
	TaskArtifactStoreS3RegionOption     = "TaskArtifactStoreS3Region"
	TaskArtifactStoreS3AccessKeyOption  = "TaskArtifactStoreS3AccessKey"
	TaskArtifactStoreS3SecretKeyOption  = "TaskArtifactStoreS3SecretKey"
	TaskArtifactStoreS3PrefixOption     = "TaskArtifactStoreS3Prefix"
	TaskArtifactStoreS3PathStyleOption  = "TaskArtifactStoreS3PathStyle"
	TaskArtifactStoreS3PresignTTLOption = "TaskArtifactStoreS3PresignTTL"
)

const (
	TaskArtifactStoreModeEnv         = "TASK_ARTIFACT_STORE_MODE"
	TaskArtifactStoreS3EndpointEnv   = "TASK_ARTIFACT_STORE_S3_ENDPOINT"
	TaskArtifactStoreS3BucketEnv     = "TASK_ARTIFACT_STORE_S3_BUCKET"
	TaskArtifactStoreS3RegionEnv     = "TASK_ARTIFACT_STORE_S3_REGION"
	TaskArtifactStoreS3AccessKeyEnv  = "TASK_ARTIFACT_STORE_S3_ACCESS_KEY"
	TaskArtifactStoreS3SecretKeyEnv  = "TASK_ARTIFACT_STORE_S3_SECRET_KEY"
	TaskArtifactStoreS3PrefixEnv     = "TASK_ARTIFACT_STORE_S3_PREFIX"
	TaskArtifactStoreS3PathStyleEnv  = "TASK_ARTIFACT_STORE_S3_PATH_STYLE"
	TaskArtifactStoreS3PresignTTLEnv = "TASK_ARTIFACT_STORE_S3_PRESIGN_TTL"
)

var (
	taskArtifactStoreBucketPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)
	taskArtifactStoreRegionPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)
)

type TaskArtifactStoreConfig struct {
	Mode                string
	S3Endpoint          string
	S3Bucket            string
	S3Region            string
	S3AccessKey         string
	S3SecretKey         string
	S3Prefix            string
	S3PathStyle         bool
	S3PresignTTLSeconds int
}

// LoadTaskArtifactStoreConfig 优先读取管理员保存的数据库配置；未保存的字段
// 才回退到环境变量，便于原有部署平滑迁移。
func LoadTaskArtifactStoreConfig() TaskArtifactStoreConfig {
	presignTTL := DefaultTaskArtifactStorePresignTTLSeconds
	presignTTLValue := taskArtifactStoreValue(
		TaskArtifactStoreS3PresignTTLOption,
		TaskArtifactStoreS3PresignTTLEnv,
		strconv.Itoa(DefaultTaskArtifactStorePresignTTLSeconds),
	)
	if parsed, err := strconv.Atoi(presignTTLValue); err == nil {
		presignTTL = parsed
	} else {
		presignTTL = 0
	}
	pathStyle, _ := strconv.ParseBool(taskArtifactStoreValue(
		TaskArtifactStoreS3PathStyleOption,
		TaskArtifactStoreS3PathStyleEnv,
		"false",
	))
	config := TaskArtifactStoreConfig{
		Mode:                taskArtifactStoreValue(TaskArtifactStoreModeOption, TaskArtifactStoreModeEnv, TaskArtifactStoreModeUpstream),
		S3Endpoint:          taskArtifactStoreValue(TaskArtifactStoreS3EndpointOption, TaskArtifactStoreS3EndpointEnv, ""),
		S3Bucket:            taskArtifactStoreValue(TaskArtifactStoreS3BucketOption, TaskArtifactStoreS3BucketEnv, ""),
		S3Region:            taskArtifactStoreValue(TaskArtifactStoreS3RegionOption, TaskArtifactStoreS3RegionEnv, ""),
		S3AccessKey:         taskArtifactStoreValue(TaskArtifactStoreS3AccessKeyOption, TaskArtifactStoreS3AccessKeyEnv, ""),
		S3SecretKey:         taskArtifactStoreValue(TaskArtifactStoreS3SecretKeyOption, TaskArtifactStoreS3SecretKeyEnv, ""),
		S3Prefix:            taskArtifactStoreValue(TaskArtifactStoreS3PrefixOption, TaskArtifactStoreS3PrefixEnv, ""),
		S3PathStyle:         pathStyle,
		S3PresignTTLSeconds: presignTTL,
	}
	if err := ValidateTaskArtifactStoreConfig(config); err != nil {
		common.SysError("invalid task artifact store configuration: " + err.Error() + "; using upstream mode")
		config.Mode = TaskArtifactStoreModeUpstream
		return config
	}
	return config
}

func taskArtifactStoreValue(optionKey, envKey, defaultValue string) string {
	common.OptionMapRWMutex.RLock()
	value, exists := common.OptionMap[optionKey]
	common.OptionMapRWMutex.RUnlock()
	if exists {
		return value
	}
	if envValue, ok := os.LookupEnv(envKey); ok {
		return envValue
	}
	return defaultValue
}

// ValidateTaskArtifactStoreConfig performs syntax checks only. It never
// resolves hosts, contacts an endpoint, or verifies credentials.
func ValidateTaskArtifactStoreConfig(config TaskArtifactStoreConfig) error {
	if config.Mode != TaskArtifactStoreModeUpstream && config.Mode != TaskArtifactStoreModeS3 {
		return fmt.Errorf("unsupported mode %q", config.Mode)
	}
	if config.S3PresignTTLSeconds <= 0 || config.S3PresignTTLSeconds > MaxTaskArtifactStorePresignTTLSeconds {
		return fmt.Errorf("S3 presign TTL must be between 1 and %d seconds", MaxTaskArtifactStorePresignTTLSeconds)
	}

	requireS3Fields := config.Mode == TaskArtifactStoreModeS3
	if requireS3Fields && config.S3Endpoint == "" {
		return errors.New("S3 endpoint is required")
	}
	if config.S3Endpoint != "" {
		if config.S3Endpoint != strings.TrimSpace(config.S3Endpoint) {
			return errors.New("S3 endpoint must not contain surrounding whitespace")
		}
		endpoint, err := url.Parse(config.S3Endpoint)
		if err != nil || endpoint == nil || endpoint.Host == "" || endpoint.User != nil || endpoint.Opaque != "" {
			return errors.New("S3 endpoint must be an absolute URL without userinfo")
		}
		if endpoint.Scheme != "http" && endpoint.Scheme != "https" {
			return errors.New("S3 endpoint must use http or https")
		}
		if endpoint.RawQuery != "" || endpoint.ForceQuery || endpoint.Fragment != "" {
			return errors.New("S3 endpoint must not contain a query or fragment")
		}
	}

	if requireS3Fields && config.S3Bucket == "" {
		return errors.New("S3 bucket is required")
	}
	if config.S3Bucket != "" {
		if !taskArtifactStoreBucketPattern.MatchString(config.S3Bucket) ||
			strings.Contains(config.S3Bucket, "..") || net.ParseIP(config.S3Bucket) != nil {
			return errors.New("S3 bucket syntax is invalid")
		}
	}

	if requireS3Fields && config.S3Region == "" {
		return errors.New("S3 region is required")
	}
	if config.S3Region != "" && !taskArtifactStoreRegionPattern.MatchString(config.S3Region) {
		return errors.New("S3 region syntax is invalid")
	}
	if err := validateTaskArtifactStoreCredential("access key", config.S3AccessKey, 256, requireS3Fields); err != nil {
		return err
	}
	if err := validateTaskArtifactStoreCredential("secret key", config.S3SecretKey, 1024, requireS3Fields); err != nil {
		return err
	}

	if config.S3Prefix != "" {
		if config.S3Prefix != strings.TrimSpace(config.S3Prefix) || len(config.S3Prefix) > 512 ||
			strings.HasPrefix(config.S3Prefix, "/") || strings.Contains(config.S3Prefix, "\\") {
			return errors.New("S3 prefix syntax is invalid")
		}
		for _, part := range strings.Split(config.S3Prefix, "/") {
			if part == "." || part == ".." {
				return errors.New("S3 prefix must not contain dot segments")
			}
		}
		for _, character := range config.S3Prefix {
			if unicode.IsControl(character) {
				return errors.New("S3 prefix must not contain control characters")
			}
		}
	}
	return nil
}

func validateTaskArtifactStoreCredential(name, value string, maxLength int, required bool) error {
	if required && value == "" {
		return fmt.Errorf("S3 %s is required", name)
	}
	if value == "" {
		return nil
	}
	if value != strings.TrimSpace(value) || len(value) > maxLength {
		return fmt.Errorf("S3 %s syntax is invalid", name)
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return fmt.Errorf("S3 %s syntax is invalid", name)
		}
	}
	return nil
}
