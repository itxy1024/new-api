package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func ListImageLogs(c *gin.Context) {
	page, pageErr := strconv.Atoi(c.DefaultQuery("p", "1"))
	size, sizeErr := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	filter := model.ImageLogFilter{
		Model:  strings.TrimSpace(c.Query("model")),
		Status: c.Query("status"),
		Prompt: strings.TrimSpace(c.Query("prompt")),
	}
	valid := pageErr == nil && sizeErr == nil && page > 0 && page <= 1000000 && size > 0 && size <= 100
	if value := c.Query("user_id"); value != "" {
		var err error
		filter.UserID, err = strconv.Atoi(value)
		valid = valid && err == nil && filter.UserID > 0
	}
	for key, target := range map[string]**time.Time{"start": &filter.Start, "end": &filter.End} {
		if value := c.Query(key); value != "" {
			parsed, err := time.ParseInLocation("2006-01-02 15:04:05", value, model.CreativeTimeLocation)
			valid = valid && err == nil
			*target = &parsed
		}
	}
	valid = valid && (filter.Start == nil || filter.End == nil || !filter.Start.After(*filter.End))
	switch filter.Status {
	case "", model.CreativeGenerationStatusCompleted, model.CreativeGenerationStatusProcessing, model.CreativeGenerationStatusFailed:
	default:
		valid = false
	}
	if !valid {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	rows, total, err := model.ListImageLogs(c.Request.Context(), c.GetInt("role") == common.RoleRootUser, filter, (page-1)*size, size)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		assets := make([]gin.H, 0, len(row.Assets))
		for _, asset := range row.Assets {
			// 统一经过受权限保护的内容接口，不向日志列表暴露存储位置或公开地址。
			if asset.UserID != row.UserID {
				continue
			}
			assets = append(assets, gin.H{
				"id":          asset.ID,
				"content_url": fmt.Sprintf("/api/image-logs/%d/assets/%d/content", row.ID, asset.ID),
				"mime_type":   asset.MimeType,
				"byte_size":   asset.ByteSize,
				"width":       asset.Width,
				"height":      asset.Height,
			})
		}
		items = append(items, gin.H{
			"id":               row.ID,
			"user_id":          row.UserID,
			"token_id":         row.TokenID,
			"client_task_id":   row.ClientTaskID,
			"provider_task_id": row.ProviderTaskID,
			"model":            row.Model,
			"group":            row.Group,
			"prompt":           row.Prompt,
			"request_params":   row.RequestParams,
			"status":           row.Status,
			"elapsed_ms":       row.ElapsedMS,
			"error_message":    row.ErrorMessage,
			"created_at":       formatCreativeTime(row.CreatedAt),
			"finished_at":      formatCreativeTimePtr(row.FinishedAt),
			"assets":           assets,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total}})
}

func ImageLogAssetContent(c *gin.Context) {
	generationID, generationErr := strconv.ParseInt(c.Param("generation_id"), 10, 64)
	assetID, assetErr := strconv.ParseInt(c.Param("asset_id"), 10, 64)
	if generationErr != nil || assetErr != nil || generationID <= 0 || assetID <= 0 {
		c.Status(http.StatusNotFound)
		return
	}
	asset, exists, err := model.GetImageLogAsset(c.Request.Context(), c.GetInt("role") == common.RoleRootUser, generationID, assetID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	if err := service.ServeImageLogAsset(c, asset); err != nil {
		c.Status(http.StatusServiceUnavailable)
	}
}
