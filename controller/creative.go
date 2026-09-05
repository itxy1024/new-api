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
	c.Request.URL.Path = "/v1/models"
	ListModels(c, constant.ChannelTypeOpenAI)
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
	if task, exists, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id")); err == nil && exists && task != nil && task.TokenId > 0 {
		keyID = strconv.Itoa(task.TokenId)
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
	if task.TokenId > 0 {
		keyID = strconv.Itoa(task.TokenId)
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
	}
	if len(body) > 0 && common.Unmarshal(body, &envelope) != nil {
		return errors.New("invalid creative request")
	}
	if envelope.KeyID <= 0 {
		return errors.New("creative key_id is required")
	}
	return prepareCreativeKeyContext(c, strconv.Itoa(envelope.KeyID))
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
	return nil
}

func writeCreativeError(c *gin.Context, err error, status int) {
	c.JSON(status, gin.H{"error": gin.H{
		"message": err.Error(),
		"type":    "invalid_request_error",
		"code":    "creative_request_failed",
	}})
}
