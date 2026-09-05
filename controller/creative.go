package controller

import (
	"bytes"
	"errors"
	"io"
	"net/http"
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
	group := ""
	if task, exists, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id")); err == nil && exists && task != nil {
		group = task.Group
	}
	if err := prepareCreativeContextWithGroup(c, group); err != nil {
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
	if err := prepareCreativeContextWithGroup(c, task.Group); err != nil {
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
		Group string `json:"group"`
	}
	if len(body) > 0 && common.Unmarshal(body, &envelope) != nil {
		return errors.New("invalid creative request")
	}
	return prepareCreativeContextWithGroup(c, envelope.Group)
}

func prepareCreativeContextWithGroup(c *gin.Context, requestedGroup string) error {
	user, err := model.GetUserCache(c.GetInt("id"))
	if err != nil || user == nil {
		return errors.New("user not found")
	}
	group := strings.TrimSpace(requestedGroup)
	if group == "" {
		group = user.Group
	}
	if group == "" {
		return errors.New("creative group is required")
	}
	if _, ok := service.GetUserUsableGroups(user.Group)[group]; !ok {
		return errors.New("creative group is not available")
	}
	user.WriteContext(c)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, group)
	common.SetContextKey(c, constant.ContextKeyTokenGroups, []string{group})
	// 临时令牌只承载用户和分组上下文，不落库也不向浏览器返回。
	if err := middleware.SetupContextForToken(c, &model.Token{UserId: user.Id, Group: group}); err != nil {
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
