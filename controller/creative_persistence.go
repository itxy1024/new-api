package controller

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	_ "golang.org/x/image/webp"
)

const (
	creativeImageRequestContextKey = "creative_image_request"
	creativeImageCaptureMaxBytes   = 256 << 20
	creativeImageDownloadMaxBytes  = 128 << 20
)

type creativeCaptureWriter struct {
	gin.ResponseWriter
	buffer   bytes.Buffer
	overflow bool
}

func (w *creativeCaptureWriter) Write(data []byte) (int, error) {
	w.capture(data)
	return w.ResponseWriter.Write(data)
}

func (w *creativeCaptureWriter) WriteString(data string) (int, error) {
	w.capture([]byte(data))
	return w.ResponseWriter.WriteString(data)
}

func (w *creativeCaptureWriter) capture(data []byte) {
	if w.overflow {
		return
	}
	if w.buffer.Len()+len(data) > creativeImageCaptureMaxBytes {
		w.buffer.Reset()
		w.overflow = true
		return
	}
	_, _ = w.buffer.Write(data)
}

type creativeImageResponse struct {
	Data []creativeImageResponseItem `json:"data"`
}

type creativeImageResponseItem struct {
	Base64Data    string `json:"b64_json"`
	URL           string `json:"url"`
	RevisedPrompt string `json:"revised_prompt"`
}

func beginCreativeImageGeneration(metadata creativeRequestEnvelope, userID, tokenID int, group string, startedAt time.Time) *model.CreativeGeneration {
	if !service.GetTaskArtifactStore().Enabled() {
		return nil
	}
	clientTaskID := strings.TrimSpace(metadata.ClientTaskID)
	if clientTaskID == "" {
		clientTaskID = uuid.NewString()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if existing, exists, err := model.GetCreativeGenerationByClientTaskID(ctx, userID, clientTaskID); err != nil {
		logger.LogError(ctx, "查询创作中心图片记录失败: "+err.Error())
		return nil
	} else if exists {
		return existing
	}
	requestParams, _ := common.Marshal(gin.H{
		"size":               metadata.Size,
		"quality":            metadata.Quality,
		"output_format":      metadata.OutputFormat,
		"output_compression": metadata.OutputCompression,
		"n":                  metadata.N,
	})
	generation := &model.CreativeGeneration{
		ClientTaskID:  clientTaskID,
		UserID:        userID,
		TokenID:       tokenID,
		MediaType:     model.CreativeMediaTypeImage,
		Model:         metadata.Model,
		Group:         group,
		Prompt:        metadata.Prompt,
		RequestParams: string(requestParams),
		Status:        model.CreativeGenerationStatusProcessing,
		CreatedAt:     startedAt,
	}
	if err := model.InsertCreativeGeneration(ctx, generation); err != nil {
		logger.LogError(ctx, "创建创作中心图片记录失败: "+err.Error())
		return nil
	}
	return generation
}

func persistCreativeImageResponse(metadata creativeRequestEnvelope, generation *model.CreativeGeneration, userID, tokenID int, group string, startedAt time.Time, elapsedMS int64, responseBody []byte) {
	if !service.GetTaskArtifactStore().Enabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	if generation == nil {
		generation = beginCreativeImageGeneration(metadata, userID, tokenID, group, startedAt)
	}
	if generation == nil {
		return
	}

	var response creativeImageResponse
	if err := common.Unmarshal(responseBody, &response); err != nil || len(response.Data) == 0 {
		finishedAt := time.Now()
		_ = model.UpdateCreativeGenerationResult(ctx, generation.ID, model.CreativeGenerationStatusFailed, elapsedMS, &finishedAt, "图片响应无法解析")
		logger.LogError(ctx, "创作中心图片响应无法解析，已跳过 OSS 持久化")
		return
	}

	for index := range response.Data {
		content, mimeType, err := loadCreativeImageContent(ctx, response.Data[index], metadata.OutputFormat)
		if err != nil {
			finishedAt := time.Now()
			_ = model.UpdateCreativeGenerationResult(ctx, generation.ID, model.CreativeGenerationStatusFailed, elapsedMS, &finishedAt, err.Error())
			logger.LogError(ctx, "读取创作中心图片结果失败: "+err.Error())
			return
		}
		width, height := 0, 0
		if dimensions, _, decodeErr := image.DecodeConfig(bytes.NewReader(content)); decodeErr == nil {
			width = dimensions.Width
			height = dimensions.Height
		}
		_, err = service.PersistCreativeAsset(ctx, service.CreativeAssetUpload{
			GenerationID: generation.ID,
			UserID:       userID,
			MediaType:    model.CreativeMediaTypeImage,
			AssetKey:     fmt.Sprintf("image-%d", index+1),
			MimeType:     mimeType,
			Width:        width,
			Height:       height,
		}, bytes.NewReader(content))
		if err != nil {
			finishedAt := time.Now()
			_ = model.UpdateCreativeGenerationResult(ctx, generation.ID, model.CreativeGenerationStatusFailed, elapsedMS, &finishedAt, err.Error())
			logger.LogError(ctx, "写入创作中心图片 OSS 失败: "+err.Error())
			return
		}
	}
	finishedAt := time.Now()
	if err := model.UpdateCreativeGenerationResult(ctx, generation.ID, model.CreativeGenerationStatusCompleted, elapsedMS, &finishedAt, ""); err != nil {
		logger.LogError(ctx, "更新创作中心图片记录失败: "+err.Error())
	}
}

func loadCreativeImageContent(ctx context.Context, item creativeImageResponseItem, outputFormat string) ([]byte, string, error) {
	if strings.TrimSpace(item.Base64Data) != "" {
		encoded := strings.TrimSpace(item.Base64Data)
		mimeType := creativeImageMimeType(outputFormat)
		if strings.HasPrefix(strings.ToLower(encoded), "data:") {
			header, payload, found := strings.Cut(encoded, ",")
			if !found {
				return nil, "", errors.New("图片 data URL 格式无效")
			}
			encoded = payload
			if detected := strings.TrimSpace(strings.SplitN(strings.TrimPrefix(header, "data:"), ";", 2)[0]); detected != "" {
				mimeType = detected
			}
		}
		content, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			content, err = base64.RawStdEncoding.DecodeString(encoded)
		}
		if err != nil || len(content) == 0 {
			return nil, "", errors.New("图片 Base64 数据无效")
		}
		if len(content) > creativeImageDownloadMaxBytes {
			return nil, "", errors.New("图片结果超过持久化大小限制")
		}
		return content, mimeType, nil
	}

	rawURL := strings.TrimSpace(item.URL)
	if rawURL == "" {
		return nil, "", errors.New("图片结果没有可用内容")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", errors.New("图片下载地址无效")
	}
	client := service.GetSSRFProtectedHTTPClient()
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, "", errors.New("下载图片结果失败")
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, "", fmt.Errorf("图片地址返回状态 %d", response.StatusCode)
	}
	content, err := io.ReadAll(io.LimitReader(response.Body, creativeImageDownloadMaxBytes+1))
	if err != nil {
		return nil, "", errors.New("读取图片结果失败")
	}
	if len(content) == 0 || len(content) > creativeImageDownloadMaxBytes {
		return nil, "", errors.New("图片结果为空或超过持久化大小限制")
	}
	mimeType := strings.TrimSpace(strings.SplitN(response.Header.Get("Content-Type"), ";", 2)[0])
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(content)
	}
	return content, mimeType, nil
}

func creativeImageMimeType(outputFormat string) string {
	switch strings.ToLower(strings.TrimSpace(outputFormat)) {
	case "jpeg", "jpg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	default:
		return "image/png"
	}
}

func ListCreativeGenerations(c *gin.Context) {
	mediaType := strings.TrimSpace(c.DefaultQuery("media_type", model.CreativeMediaTypeImage))
	if mediaType != model.CreativeMediaTypeImage && mediaType != model.CreativeMediaTypeVideo {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "media_type 无效"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	generations, err := model.ListCreativeGenerations(c.Request.Context(), c.GetInt("id"), mediaType, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]gin.H, 0, len(generations))
	for index := range generations {
		assets := make([]gin.H, 0, len(generations[index].Assets))
		for assetIndex := range generations[index].Assets {
			asset := &generations[index].Assets[assetIndex]
			contentURL, urlErr := service.EnsureCreativeAssetPublicURL(c.Request.Context(), asset)
			if urlErr != nil {
				logger.LogError(c.Request.Context(), "读取创作中心 OSS 固定地址失败: "+urlErr.Error())
				contentURL = fmt.Sprintf("/api/creative/generations/%d/assets/%d/content", generations[index].ID, asset.ID)
			}
			assets = append(assets, gin.H{
				"id":          asset.ID,
				"asset_key":   asset.AssetKey,
				"content_url": contentURL,
				"mime_type":   asset.MimeType,
				"byte_size":   asset.ByteSize,
				"width":       asset.Width,
				"height":      asset.Height,
				"duration_ms": asset.DurationMS,
			})
		}
		items = append(items, gin.H{
			"id":               generations[index].ID,
			"client_task_id":   generations[index].ClientTaskID,
			"token_id":         generations[index].TokenID,
			"provider_task_id": generations[index].ProviderTaskID,
			"media_type":       generations[index].MediaType,
			"model":            generations[index].Model,
			"group":            generations[index].Group,
			"prompt":           generations[index].Prompt,
			"request_params":   generations[index].RequestParams,
			"status":           generations[index].Status,
			"elapsed_ms":       generations[index].ElapsedMS,
			"error_message":    generations[index].ErrorMessage,
			"created_at":       formatCreativeTime(generations[index].CreatedAt),
			"finished_at":      formatCreativeTimePtr(generations[index].FinishedAt),
			"output_urls":      generations[index].OutputURLs,
			"assets":           assets,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

func formatCreativeTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.In(time.Local).Format("2006-01-02 15:04:05")
}

func formatCreativeTimePtr(value *time.Time) any {
	if value == nil || value.IsZero() {
		return nil
	}
	return formatCreativeTime(*value)
}

func CreativeGenerationAssetContent(c *gin.Context) {
	generationID, generationErr := strconv.ParseInt(c.Param("generation_id"), 10, 64)
	assetID, assetErr := strconv.ParseInt(c.Param("asset_id"), 10, 64)
	if generationErr != nil || assetErr != nil || generationID <= 0 || assetID <= 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "生成结果不存在"})
		return
	}
	asset, exists, err := model.GetCreativeAsset(c.Request.Context(), c.GetInt("id"), generationID, assetID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists || asset == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "生成结果不存在"})
		return
	}
	if err := service.ServeCreativeAsset(c, asset); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "生成结果暂时无法读取"})
	}
}

func DeleteCreativeGeneration(c *gin.Context) {
	generationID, err := strconv.ParseInt(c.Param("generation_id"), 10, 64)
	if err != nil || generationID <= 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "生成记录不存在"})
		return
	}
	deleteCreativeGeneration(c, generationID)
}

func DeleteCreativeGenerationByClientTaskID(c *gin.Context) {
	clientTaskID := strings.TrimSpace(c.Param("client_task_id"))
	if validateCreativeClientTaskID(clientTaskID) != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "生成记录不存在"})
		return
	}
	generation, exists, err := model.GetCreativeGenerationByClientTaskID(c.Request.Context(), c.GetInt("id"), clientTaskID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists || generation == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "生成记录不存在"})
		return
	}
	deleteCreativeGeneration(c, generation.ID)
}

func deleteCreativeGeneration(c *gin.Context, generationID int64) {
	generation, exists, err := model.MarkCreativeGenerationDeleted(c.Request.Context(), c.GetInt("id"), generationID)
	if err != nil || !exists {
		if err != nil {
			common.ApiError(c, err)
		} else {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "生成记录不存在"})
		}
		return
	}
	if len(generation.Assets) > 0 {
		if err := service.DeleteCreativeAssets(c.Request.Context(), generation.Assets); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "删除 OSS 文件失败"})
			return
		}
	}
	if err := model.DeleteCreativeGeneration(c.Request.Context(), c.GetInt("id"), generation.ID); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
