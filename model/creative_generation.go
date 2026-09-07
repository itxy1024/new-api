package model

import (
	"context"
	"errors"

	"gorm.io/gorm"
)

const (
	CreativeMediaTypeImage = "image"
	CreativeMediaTypeVideo = "video"

	CreativeGenerationStatusProcessing = "processing"
	CreativeGenerationStatusCompleted  = "completed"
	CreativeGenerationStatusFailed     = "failed"
	CreativeGenerationStatusDeleted    = "deleted"
)

var ErrCreativeGenerationInactive = errors.New("creative generation is no longer active")

// CreativeGeneration 保存当前 NewAPI 用户的一次创作请求。
// 文件二进制不写入数据库，只通过 CreativeAsset 记录对象存储位置。
type CreativeGeneration struct {
	ID             int64           `json:"id" gorm:"primaryKey"`
	ClientTaskID   string          `json:"client_task_id" gorm:"type:varchar(191);not null;uniqueIndex:idx_creative_generation_user_client"`
	ProviderTaskID string          `json:"provider_task_id,omitempty" gorm:"type:varchar(191);index"`
	UserID         int             `json:"user_id" gorm:"not null;uniqueIndex:idx_creative_generation_user_client;index:idx_creative_generation_user_media_created,priority:1"`
	TokenID        int             `json:"token_id" gorm:"index"`
	MediaType      string          `json:"media_type" gorm:"type:varchar(20);not null;index:idx_creative_generation_user_media_created,priority:2"`
	Model          string          `json:"model" gorm:"type:varchar(191)"`
	Group          string          `json:"group" gorm:"type:varchar(64)"`
	Prompt         string          `json:"prompt" gorm:"type:text"`
	RequestParams  string          `json:"request_params,omitempty" gorm:"type:text"`
	Status         string          `json:"status" gorm:"type:varchar(20);not null;index"`
	ElapsedMS      int64           `json:"elapsed_ms"`
	ErrorMessage   string          `json:"error_message,omitempty" gorm:"type:text"`
	CreatedAt      int64           `json:"created_at" gorm:"not null;index:idx_creative_generation_user_media_created,priority:3"`
	FinishedAt     int64           `json:"finished_at"`
	Assets         []CreativeAsset `json:"assets,omitempty" gorm:"foreignKey:GenerationID"`
}

type CreativeAsset struct {
	ID             int64  `json:"id" gorm:"primaryKey"`
	GenerationID   int64  `json:"generation_id" gorm:"not null;uniqueIndex:idx_creative_asset_generation_key"`
	UserID         int    `json:"user_id" gorm:"not null;index"`
	AssetKey       string `json:"asset_key" gorm:"type:varchar(128);not null;uniqueIndex:idx_creative_asset_generation_key"`
	StorageBackend string `json:"storage_backend" gorm:"type:varchar(20);not null"`
	Bucket         string `json:"bucket" gorm:"type:varchar(255);not null"`
	ObjectKey      string `json:"object_key" gorm:"type:varchar(1024);not null"`
	PublicURL      string `json:"public_url" gorm:"type:text"`
	MimeType       string `json:"mime_type" gorm:"type:varchar(255)"`
	ByteSize       int64  `json:"byte_size"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	DurationMS     int64  `json:"duration_ms"`
	Checksum       string `json:"checksum,omitempty" gorm:"type:varchar(64)"`
	CreatedAt      int64  `json:"created_at" gorm:"not null;index"`
}

func InsertCreativeGeneration(ctx context.Context, generation *CreativeGeneration) error {
	return DB.WithContext(ctx).Create(generation).Error
}

func UpdateCreativeGenerationResult(ctx context.Context, generationID int64, status string, elapsedMS, finishedAt int64, errorMessage string) error {
	return DB.WithContext(ctx).Model(&CreativeGeneration{}).
		Where("id = ? AND status <> ?", generationID, CreativeGenerationStatusDeleted).
		Updates(map[string]any{
			"status":        status,
			"elapsed_ms":    elapsedMS,
			"finished_at":   finishedAt,
			"error_message": errorMessage,
		}).Error
}

func InsertCreativeAsset(ctx context.Context, asset *CreativeAsset) error {
	return DB.WithContext(ctx).Create(asset).Error
}

func InsertCreativeAssetForActiveGeneration(ctx context.Context, asset *CreativeAsset) error {
	return DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var generation CreativeGeneration
		err := lockForUpdate(tx).
			Where("id = ? AND user_id = ? AND status <> ?", asset.GenerationID, asset.UserID, CreativeGenerationStatusDeleted).
			First(&generation).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCreativeGenerationInactive
		}
		if err != nil {
			return err
		}
		return tx.Create(asset).Error
	})
}

func SetCreativeAssetPublicURL(ctx context.Context, assetID int64, publicURL string) error {
	return DB.WithContext(ctx).Model(&CreativeAsset{}).
		Where("id = ? AND (public_url = ? OR public_url IS NULL)", assetID, "").
		Update("public_url", publicURL).Error
}

func GetCreativeGenerationByClientTaskID(ctx context.Context, userID int, clientTaskID string) (*CreativeGeneration, bool, error) {
	var generation CreativeGeneration
	err := DB.WithContext(ctx).
		Where("user_id = ? AND client_task_id = ?", userID, clientTaskID).
		First(&generation).Error
	exists, err := RecordExist(err)
	return &generation, exists, err
}

func GetCreativeGeneration(ctx context.Context, userID int, generationID int64) (*CreativeGeneration, bool, error) {
	var generation CreativeGeneration
	err := DB.WithContext(ctx).
		Preload("Assets", func(query *gorm.DB) *gorm.DB {
			return query.Order("id ASC")
		}).
		Where("user_id = ? AND id = ?", userID, generationID).
		First(&generation).Error
	exists, err := RecordExist(err)
	return &generation, exists, err
}

func ListCreativeGenerations(ctx context.Context, userID int, mediaType string, limit int) ([]CreativeGeneration, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	query := DB.WithContext(ctx).
		Preload("Assets", func(query *gorm.DB) *gorm.DB {
			return query.Order("id ASC")
		}).
		Where("user_id = ? AND status <> ?", userID, CreativeGenerationStatusDeleted)
	if mediaType != "" {
		query = query.Where("media_type = ?", mediaType)
	}
	var generations []CreativeGeneration
	err := query.Order("created_at DESC, id DESC").Limit(limit).Find(&generations).Error
	return generations, err
}

func GetCreativeAsset(ctx context.Context, userID int, generationID, assetID int64) (*CreativeAsset, bool, error) {
	var asset CreativeAsset
	err := DB.WithContext(ctx).
		Table("creative_assets").
		Select("creative_assets.*").
		Joins("JOIN creative_generations ON creative_generations.id = creative_assets.generation_id").
		Where("creative_assets.user_id = ? AND creative_assets.generation_id = ? AND creative_assets.id = ? AND creative_generations.status <> ?", userID, generationID, assetID, CreativeGenerationStatusDeleted).
		First(&asset).Error
	exists, err := RecordExist(err)
	return &asset, exists, err
}

func GetCreativeAssetByGenerationKey(ctx context.Context, userID int, generationID int64, assetKey string) (*CreativeAsset, bool, error) {
	var asset CreativeAsset
	err := DB.WithContext(ctx).
		Where("user_id = ? AND generation_id = ? AND asset_key = ?", userID, generationID, assetKey).
		First(&asset).Error
	exists, err := RecordExist(err)
	return &asset, exists, err
}

func GetCreativeAssetForTask(ctx context.Context, userID int, providerTaskID, assetKey string) (*CreativeAsset, bool, error) {
	var asset CreativeAsset
	err := DB.WithContext(ctx).
		Table("creative_assets").
		Select("creative_assets.*").
		Joins("JOIN creative_generations ON creative_generations.id = creative_assets.generation_id").
		Where("creative_generations.user_id = ? AND creative_generations.provider_task_id = ? AND creative_assets.asset_key = ? AND creative_generations.status <> ?", userID, providerTaskID, assetKey, CreativeGenerationStatusDeleted).
		First(&asset).Error
	exists, err := RecordExist(err)
	return &asset, exists, err
}

func MarkCreativeGenerationDeleted(ctx context.Context, userID int, generationID int64) (*CreativeGeneration, bool, error) {
	var result *CreativeGeneration
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var generation CreativeGeneration
		err := lockForUpdate(tx).
			Where("user_id = ? AND id = ?", userID, generationID).
			First(&generation).Error
		exists, err := RecordExist(err)
		if err != nil || !exists {
			return err
		}
		if generation.Status != CreativeGenerationStatusDeleted {
			if err := tx.Model(&CreativeGeneration{}).
				Where("user_id = ? AND id = ?", userID, generationID).
				Update("status", CreativeGenerationStatusDeleted).Error; err != nil {
				return err
			}
			generation.Status = CreativeGenerationStatusDeleted
		}
		if err := tx.Where("user_id = ? AND generation_id = ?", userID, generationID).
			Order("id ASC").
			Find(&generation.Assets).Error; err != nil {
			return err
		}
		result = &generation
		return nil
	})
	return result, result != nil, err
}

func DeleteCreativeGeneration(ctx context.Context, userID int, generationID int64) error {
	return DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND generation_id = ?", userID, generationID).Delete(&CreativeAsset{}).Error; err != nil {
			return err
		}
		return tx.Where("user_id = ? AND id = ?", userID, generationID).Delete(&CreativeGeneration{}).Error
	})
}
