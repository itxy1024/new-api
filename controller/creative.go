package controller

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

var errCreativeKeyGroupUnavailable = errors.New("creative key group is not available for this user")

// 使用登录态复用生图 relay，浏览器不需要接触任何 API Key。
func CreativeImage(c *gin.Context) {
	if !service.GetTaskArtifactStore().Enabled() {
		Relay(c, types.RelayFormatOpenAIImage)
		return
	}
	metadataValue, _ := c.Get(creativeImageRequestContextKey)
	metadata, _ := metadataValue.(creativeRequestEnvelope)
	userID := c.GetInt("id")
	tokenID := c.GetInt("token_id")
	group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	startedAt := model.CreativeNow()
	generation := beginCreativeImageGeneration(metadata, userID, tokenID, group, startedAt)
	originalWriter := c.Writer
	captureWriter := &creativeCaptureWriter{ResponseWriter: originalWriter}
	c.Writer = captureWriter
	Relay(c, types.RelayFormatOpenAIImage)
	elapsedMS := time.Since(startedAt).Milliseconds()
	status := captureWriter.Status()
	c.Writer = originalWriter
	if status < http.StatusOK || status >= http.StatusMultipleChoices || captureWriter.overflow || captureWriter.buffer.Len() == 0 {
		if generation != nil {
			finishedAt := model.CreativeNow()
			_ = model.UpdateCreativeGenerationResult(c.Request.Context(), generation.ID, model.CreativeGenerationStatusFailed, elapsedMS, &finishedAt, "图片生成请求失败")
		}
		return
	}
	responseBody := append([]byte(nil), captureWriter.buffer.Bytes()...)
	go persistCreativeImageResponse(metadata, generation, userID, tokenID, group, startedAt, elapsedMS, responseBody)
}

// 在分发中间件前建立登录态令牌上下文。
func PrepareCreativeImageContext(c *gin.Context) {
	if err := prepareCreativeContext(c); err != nil {
		writeCreativeError(c, err, http.StatusBadRequest)
		c.Abort()
		return
	}
	path := "/v1/images/generations"
	if isCreativeImageEdit(c) {
		if err := convertCreativeJSONEditToMultipart(c); err != nil {
			writeCreativeError(c, err, http.StatusBadRequest)
			c.Abort()
			return
		}
		path = "/v1/images/edits"
	}
	c.Request.URL.Path = path
	c.Request.RequestURI = c.Request.URL.Path
	c.Next()
}

// CreativeModels 返回当前用户指定 API Key 可用的模型列表。
func CreativeModels(c *gin.Context) {
	if err := prepareCreativeKeyContext(c, c.Query("key_id")); err != nil {
		if writeCreativeModelsUnavailableGroup(c, err) {
			return
		}
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
	modelLimitEnabled := common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled)
	var modelLimit map[string]bool
	if modelLimitEnabled {
		if raw, ok := common.GetContextKey(c, constant.ContextKeyTokenModelLimit); ok {
			modelLimit, _ = raw.(map[string]bool)
		}
		if modelLimit == nil {
			modelLimit = map[string]bool{}
		}
	}
	for _, group := range expandedGroups {
		if strings.TrimSpace(group) == "" {
			continue
		}
		for _, name := range model.GetGroupEnabledModels(group) {
			if modelLimitEnabled {
				matchingName := ratio_setting.FormatMatchingModelName(name)
				if !modelLimit[name] && !modelLimit[matchingName] {
					continue
				}
			}
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

func writeCreativeModelsUnavailableGroup(c *gin.Context, err error) bool {
	if !errors.Is(err, errCreativeKeyGroupUnavailable) {
		return false
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": []gin.H{}, "object": "list"})
	return true
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
	// 任务状态查询按当前登录用户校验任务归属，不要求生成时使用的 Key
	// 仍处于启用、未过期且有余额状态；否则已提交的异步任务可能无法查看结果。
	// 创作中心 GET 路由没有经过 Distribute，中间件不会自动设置 relay_mode。
	// 显式设置后，GenRelayInfo 才能选择视频任务查询响应构造器。
	c.Set("relay_mode", relayconstant.RelayModeVideoFetchByID)
	c.Request.URL.Path = "/v1/video/generations/" + c.Param("task_id")
	c.Request.RequestURI = c.Request.URL.Path
	RelayTaskFetch(c)
	if c.Writer.Status() >= http.StatusOK && c.Writer.Status() < http.StatusMultipleChoices {
		scheduleCreativeVideoPersistence(c.GetInt("id"), c.Param("task_id"))
	}
}

// 通过现有的视频内容安全代理返回结果。
func CreativeVideoContent(c *gin.Context) {
	task, exists, err := model.GetByTaskId(c.GetInt("id"), c.Param("task_id"))
	if err != nil || !exists || task == nil {
		writeCreativeError(c, errors.New("task not found"), http.StatusNotFound)
		return
	}
	// 内容读取同样由 VideoProxy 根据登录用户和任务 ID 做归属校验。
	// 不重新校验原始 Key，避免 Key 后续禁用或过期导致已完成视频不可读。
	c.Request.URL.Path = "/v1/videos/" + c.Param("task_id") + "/content"
	c.Request.RequestURI = c.Request.URL.Path
	VideoProxy(c)
}

func prepareCreativeContext(c *gin.Context) error {
	if strings.HasPrefix(strings.ToLower(c.Request.Header.Get("Content-Type")), "multipart/form-data") {
		form, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			return errors.New("invalid creative multipart request")
		}
		c.Request.MultipartForm = form
		values := url.Values(form.Value)
		keyID := strings.TrimSpace(values.Get("key_id"))
		requestedGroup := strings.TrimSpace(values.Get("group"))
		metadata := creativeRequestEnvelope{
			ClientTaskID: strings.TrimSpace(values.Get("client_task_id")),
			Model:        strings.TrimSpace(values.Get("model")),
			Prompt:       values.Get("prompt"),
			Size:         strings.TrimSpace(values.Get("size")),
			Quality:      strings.TrimSpace(values.Get("quality")),
			OutputFormat: strings.TrimSpace(values.Get("output_format")),
		}
		if outputCompression, parseErr := strconv.Atoi(values.Get("output_compression")); parseErr == nil {
			metadata.OutputCompression = &outputCompression
		}
		if count, parseErr := strconv.Atoi(values.Get("n")); parseErr == nil {
			metadata.N = &count
		}
		if keyID == "" {
			return errors.New("creative key_id is required")
		}
		if err := validateCreativeClientTaskID(metadata.ClientTaskID); err != nil {
			return err
		}
		// 这些字段只用于创作中心路由，不应随 multipart 请求转发到厂商。
		for _, field := range []string{"key_id", "group", "client_task_id", "interface_mode", "retry_count"} {
			delete(form.Value, field)
		}
		c.Request.PostForm = url.Values(form.Value)
		parsedKeyID, err := strconv.Atoi(keyID)
		if err != nil || parsedKeyID <= 0 {
			return errors.New("creative key_id is required")
		}
		if len(form.File["image"]) > 0 || len(form.File["image[]"]) > 0 || len(form.File["mask"]) > 0 {
			c.Set("creative_image_edit", true)
		}
		if err := prepareCreativeKeyContext(c, strconv.Itoa(parsedKeyID)); err != nil {
			return err
		}
		if requestedGroup != "" {
			if err := setCreativeGroup(c, requestedGroup); err != nil {
				return err
			}
		}
		c.Set(creativeImageRequestContextKey, metadata)
		return nil
	}

	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		return errors.New("failed to read creative request")
	}
	body, err := bodyStorage.Bytes()
	if err != nil {
		return errors.New("failed to read creative request")
	}
	if _, err := bodyStorage.Seek(0, io.SeekStart); err != nil {
		return err
	}
	c.Request.Body = io.NopCloser(bodyStorage)
	var envelope creativeRequestEnvelope
	if len(body) > 0 && common.Unmarshal(body, &envelope) != nil {
		return errors.New("invalid creative request")
	}
	if envelope.KeyID <= 0 {
		return errors.New("creative key_id is required")
	}
	if err := validateCreativeClientTaskID(envelope.ClientTaskID); err != nil {
		return err
	}
	if len(envelope.Images) > 0 || strings.TrimSpace(envelope.Mask) != "" {
		c.Set("creative_image_edit", true)
	}
	if err := prepareCreativeKeyContext(c, strconv.Itoa(envelope.KeyID)); err != nil {
		return err
	}
	if strings.TrimSpace(envelope.Group) != "" {
		if err := setCreativeGroup(c, envelope.Group); err != nil {
			return err
		}
	}
	c.Set(creativeImageRequestContextKey, envelope)
	return nil
}

func validateCreativeClientTaskID(clientTaskID string) error {
	if clientTaskID == "" {
		return nil
	}
	if clientTaskID != strings.TrimSpace(clientTaskID) || len(clientTaskID) > 191 || strings.IndexFunc(clientTaskID, unicode.IsControl) >= 0 {
		return errors.New("creative client_task_id is invalid")
	}
	return nil
}

// creativeRequestEnvelope 是创作中心请求中由 NewAPI 自己消费的字段和
// OpenAI 图片接口公共字段的最小集合。输入图片仍然只在服务端转换为
// multipart 文件，厂商密钥不会进入浏览器或上游请求体。
type creativeRequestEnvelope struct {
	KeyID             int      `json:"key_id"`
	ClientTaskID      string   `json:"client_task_id"`
	Group             string   `json:"group"`
	Model             string   `json:"model"`
	Prompt            string   `json:"prompt"`
	Size              string   `json:"size"`
	Quality           string   `json:"quality"`
	ResponseFormat    string   `json:"response_format"`
	OutputFormat      string   `json:"output_format"`
	OutputCompression *int     `json:"output_compression"`
	Moderation        string   `json:"moderation"`
	N                 *int     `json:"n"`
	Stream            *bool    `json:"stream"`
	Background        string   `json:"background"`
	InputFidelity     string   `json:"input_fidelity"`
	Watermark         *bool    `json:"watermark"`
	Images            []string `json:"images"`
	Mask              string   `json:"mask"`
}

// convertCreativeJSONEditToMultipart 将参考项目使用的 data URL 数组转换为
// NewAPI 标准图片编辑 relay 能识别的 image/image[] 与 mask 文件字段。
func convertCreativeJSONEditToMultipart(c *gin.Context) error {
	if !strings.HasPrefix(strings.ToLower(c.Request.Header.Get("Content-Type")), "application/json") {
		return nil
	}
	body, err := common.GetBodyStorage(c)
	if err != nil {
		return err
	}
	data, err := body.Bytes()
	if err != nil {
		return err
	}
	var envelope creativeRequestEnvelope
	if err := common.Unmarshal(data, &envelope); err != nil {
		return errors.New("invalid creative image edit request")
	}
	if len(envelope.Images) == 0 {
		return nil
	}
	if len(envelope.Images) > 16 {
		return errors.New("too many input images")
	}

	var formBody bytes.Buffer
	writer := multipart.NewWriter(&formBody)
	writeField := func(name, value string) error {
		if strings.TrimSpace(value) == "" {
			return nil
		}
		return writer.WriteField(name, value)
	}
	if err := writeField("model", envelope.Model); err != nil {
		return err
	}
	if err := writeField("prompt", envelope.Prompt); err != nil {
		return err
	}
	if err := writeField("size", envelope.Size); err != nil {
		return err
	}
	if err := writeField("quality", envelope.Quality); err != nil {
		return err
	}
	if err := writeField("response_format", envelope.ResponseFormat); err != nil {
		return err
	}
	if err := writeField("output_format", envelope.OutputFormat); err != nil {
		return err
	}
	if envelope.OutputCompression != nil {
		if err := writeField("output_compression", strconv.Itoa(*envelope.OutputCompression)); err != nil {
			return err
		}
	}
	if err := writeField("moderation", envelope.Moderation); err != nil {
		return err
	}
	if envelope.N != nil {
		if err := writeField("n", strconv.Itoa(*envelope.N)); err != nil {
			return err
		}
	}
	if envelope.Stream != nil {
		if err := writeField("stream", strconv.FormatBool(*envelope.Stream)); err != nil {
			return err
		}
	}
	if err := writeField("background", envelope.Background); err != nil {
		return err
	}
	if err := writeField("input_fidelity", envelope.InputFidelity); err != nil {
		return err
	}
	if envelope.Watermark != nil {
		if err := writeField("watermark", strconv.FormatBool(*envelope.Watermark)); err != nil {
			return err
		}
	}

	for index, value := range envelope.Images {
		imageBytes, extension, err := decodeCreativeDataURL(value)
		if err != nil {
			return fmt.Errorf("invalid input image %d: %w", index+1, err)
		}
		fieldName := "image"
		if len(envelope.Images) > 1 {
			fieldName = "image[]"
		}
		part, err := writer.CreateFormFile(fieldName, fmt.Sprintf("image-%d%s", index+1, extension))
		if err != nil {
			return err
		}
		if _, err := part.Write(imageBytes); err != nil {
			return err
		}
	}
	if strings.TrimSpace(envelope.Mask) != "" {
		maskBytes, maskExtension, err := decodeCreativeDataURL(envelope.Mask)
		if err != nil {
			return fmt.Errorf("invalid mask image: %w", err)
		}
		part, err := writer.CreateFormFile("mask", "mask"+maskExtension)
		if err != nil {
			return err
		}
		if _, err := part.Write(maskBytes); err != nil {
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}

	// BodyStorage 可能已经由 prepareCreativeContext 创建，替换请求体时同步
	// 更新缓存，确保 Relay 的重试和 multipart 解析读取的是同一份数据。
	_ = body.Close()
	newBody, err := common.CreateBodyStorage(formBody.Bytes())
	if err != nil {
		return err
	}
	c.Set(common.KeyBodyStorage, newBody)
	c.Request.Body = io.NopCloser(newBody)
	c.Request.ContentLength = int64(formBody.Len())
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	c.Set("_original_multipart_ct", writer.FormDataContentType())
	return nil
}

func decodeCreativeDataURL(value string) ([]byte, string, error) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(strings.ToLower(value), "data:") {
		return nil, "", errors.New("image must be a data URL")
	}
	header, payload, found := strings.Cut(value, ",")
	if !found || strings.TrimSpace(payload) == "" {
		return nil, "", errors.New("image data URL is malformed")
	}
	meta := strings.TrimPrefix(header, "data:")
	mimeType := strings.TrimSpace(strings.SplitN(meta, ";", 2)[0])
	if mimeType == "" {
		mimeType = "image/png"
	}
	var data []byte
	var err error
	if strings.Contains(strings.ToLower(meta), ";base64") {
		encoded := strings.TrimSpace(payload)
		data, err = base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			// 某些前端会省略 Base64 尾部填充，兼容无填充编码。
			data, err = base64.RawStdEncoding.DecodeString(encoded)
		}
	} else {
		var decoded string
		decoded, err = url.PathUnescape(payload)
		data = []byte(decoded)
	}
	if err != nil || len(data) == 0 {
		if err == nil {
			err = errors.New("image data is empty")
		}
		return nil, "", err
	}
	extension := ".png"
	switch strings.ToLower(mimeType) {
	case "image/jpeg", "image/jpg":
		extension = ".jpg"
	case "image/webp":
		extension = ".webp"
	}
	return data, extension, nil
}

func isCreativeImageEdit(c *gin.Context) bool {
	value, exists := c.Get("creative_image_edit")
	edit, ok := value.(bool)
	return exists && ok && edit
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
	if !token.UnlimitedQuota && token.RemainQuota <= 0 {
		return errors.New("creative key quota is exhausted")
	}
	if token.ExpiredTime != -1 && token.ExpiredTime <= common.GetTimestamp() {
		return errors.New("creative key is expired")
	}
	tokenGroups := getCreativeUsableTokenGroups(user.Group, token.GetGroups())
	if len(tokenGroups) == 0 {
		return errCreativeKeyGroupUnavailable
	}
	user.WriteContext(c)
	// 临时上下文只承载用户选择的 Key，不向浏览器返回真实 Key。
	if err := middleware.SetupContextForToken(c, token); err != nil {
		return err
	}
	// 普通 TokenAuth 会在 SetupContextForToken 前设置 using_group；创作中心
	// 直接从登录态进入，因此这里必须同步所选 Key 的分组，否则分发器会
	// 回退到用户默认分组。
	common.SetContextKey(c, constant.ContextKeyTokenGroups, tokenGroups)
	usingGroup := tokenGroups[0]
	if strings.TrimSpace(usingGroup) == "" {
		usingGroup = user.Group
	}
	common.SetContextKey(c, constant.ContextKeyTokenGroup, usingGroup)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)
	return nil
}

func getCreativeUsableTokenGroups(userGroup string, tokenGroups []string) []string {
	if len(tokenGroups) == 0 {
		tokenGroups = []string{userGroup}
	}
	groups := make([]string, 0, len(tokenGroups))
	seen := make(map[string]struct{}, len(tokenGroups))
	for _, group := range tokenGroups {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		if _, exists := seen[group]; exists {
			continue
		}
		seen[group] = struct{}{}
		if group != "auto" && !service.IsUserSelectableGroup(userGroup, group) {
			continue
		}
		groups = append(groups, group)
	}
	return groups
}

func setCreativeGroup(c *gin.Context, requested string) error {
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return nil
	}
	if requested == "auto" {
		raw, _ := common.GetContextKey(c, constant.ContextKeyTokenGroups)
		groups, valid := raw.([]string)
		if !valid || len(groups) == 0 {
			return errors.New("creative group is not available for this key")
		}
		for _, group := range groups {
			if group == "auto" {
				return bindCreativeGroup(c, requested)
			}
		}
		return errors.New("creative group is not available for this key")
	}
	raw, ok := common.GetContextKey(c, constant.ContextKeyTokenGroups)
	if groups, valid := raw.([]string); ok && valid && len(groups) > 0 {
		for _, group := range groups {
			if group == requested {
				return bindCreativeGroup(c, requested)
			}
			// auto 是一个分组别名，模型列表会展开为实际可用分组。
			// 选择展开后的分组时也要允许通过，不能因为 token_groups
			// 只保存了 auto 而回退到用户默认分组。
			if group == "auto" {
				userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
				for _, expanded := range service.GetRequestAutoGroups(c, userGroup) {
					if expanded == requested {
						return bindCreativeGroup(c, requested)
					}
				}
			}
		}
		return errors.New("creative group is not available for this key")
	}
	if requested != common.GetContextKeyString(c, constant.ContextKeyUsingGroup) {
		return errors.New("creative group is not available for this key")
	}
	return nil
}

func bindCreativeGroup(c *gin.Context, group string) error {
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, group)
	// 分发器在 Token 配置了多个分组时会按 token_groups 自动匹配模型。
	// 创作中心已经明确选择了分组，此处收窄本次请求的候选分组，
	// 避免同名模型被错误路由到 default 或其他分组。
	common.SetContextKey(c, constant.ContextKeyTokenGroups, []string{group})
	return nil
}

func writeCreativeError(c *gin.Context, err error, status int) {
	c.JSON(status, gin.H{"error": gin.H{
		"message": err.Error(),
		"type":    "invalid_request_error",
		"code":    "creative_request_failed",
	}})
}
