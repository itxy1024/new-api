package controller

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

type creativeStorageRequest struct {
	Enabled           bool   `json:"enabled"`
	Endpoint          string `json:"endpoint"`
	Bucket            string `json:"bucket"`
	Region            string `json:"region"`
	AccessKey         string `json:"access_key"`
	SecretKey         string `json:"secret_key"`
	Prefix            string `json:"prefix"`
	PathStyle         bool   `json:"path_style"`
	PresignTTLSeconds int    `json:"presign_ttl_seconds"`
}

func GetCreativeStorageConfig(c *gin.Context) {
	config := system_setting.LoadTaskArtifactStoreConfig()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled":               config.Mode == system_setting.TaskArtifactStoreModeS3,
			"endpoint":              config.S3Endpoint,
			"bucket":                config.S3Bucket,
			"region":                config.S3Region,
			"prefix":                config.S3Prefix,
			"path_style":            config.S3PathStyle,
			"presign_ttl_seconds":   config.S3PresignTTLSeconds,
			"access_key_configured": config.S3AccessKey != "",
			"secret_key_configured": config.S3SecretKey != "",
		},
	})
}

func UpdateCreativeStorageConfig(c *gin.Context) {
	request, config, ok := bindCreativeStorageRequest(c)
	if !ok {
		return
	}
	values := map[string]string{
		system_setting.TaskArtifactStoreModeOption:         config.Mode,
		system_setting.TaskArtifactStoreS3EndpointOption:   config.S3Endpoint,
		system_setting.TaskArtifactStoreS3BucketOption:     config.S3Bucket,
		system_setting.TaskArtifactStoreS3RegionOption:     config.S3Region,
		system_setting.TaskArtifactStoreS3AccessKeyOption:  config.S3AccessKey,
		system_setting.TaskArtifactStoreS3SecretKeyOption:  config.S3SecretKey,
		system_setting.TaskArtifactStoreS3PrefixOption:     config.S3Prefix,
		system_setting.TaskArtifactStoreS3PathStyleOption:  strconv.FormatBool(config.S3PathStyle),
		system_setting.TaskArtifactStoreS3PresignTTLOption: strconv.Itoa(config.S3PresignTTLSeconds),
	}
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	service.ReloadTaskArtifactStore()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled":               request.Enabled,
			"access_key_configured": config.S3AccessKey != "",
			"secret_key_configured": config.S3SecretKey != "",
		},
	})
}

func TestCreativeStorageConfig(c *gin.Context) {
	_, config, ok := bindCreativeStorageRequest(c)
	if !ok {
		return
	}
	if config.Mode != system_setting.TaskArtifactStoreModeS3 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请先开启 OSS 存储"})
		return
	}
	testContext, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	if err := service.TestTaskArtifactStore(testContext, config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "OSS 连接测试失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func bindCreativeStorageRequest(c *gin.Context) (creativeStorageRequest, system_setting.TaskArtifactStoreConfig, bool) {
	var request creativeStorageRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "OSS 配置格式无效"})
		return request, system_setting.TaskArtifactStoreConfig{}, false
	}
	current := system_setting.LoadTaskArtifactStoreConfig()
	accessKey := strings.TrimSpace(request.AccessKey)
	if accessKey == "" {
		accessKey = current.S3AccessKey
	}
	secretKey := strings.TrimSpace(request.SecretKey)
	if secretKey == "" {
		secretKey = current.S3SecretKey
	}
	mode := system_setting.TaskArtifactStoreModeUpstream
	if request.Enabled {
		mode = system_setting.TaskArtifactStoreModeS3
	}
	presignTTL := request.PresignTTLSeconds
	if presignTTL == 0 {
		presignTTL = system_setting.DefaultTaskArtifactStorePresignTTLSeconds
	}
	config := system_setting.TaskArtifactStoreConfig{
		Mode:                mode,
		S3Endpoint:          strings.TrimSpace(request.Endpoint),
		S3Bucket:            strings.TrimSpace(request.Bucket),
		S3Region:            strings.TrimSpace(request.Region),
		S3AccessKey:         accessKey,
		S3SecretKey:         secretKey,
		S3Prefix:            strings.Trim(strings.TrimSpace(request.Prefix), "/"),
		S3PathStyle:         request.PathStyle,
		S3PresignTTLSeconds: presignTTL,
	}
	if err := system_setting.ValidateTaskArtifactStoreConfig(config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return request, config, false
	}
	return request, config, true
}
