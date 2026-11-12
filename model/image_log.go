package model

import (
	"context"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type ImageLogFilter struct {
	UserID int
	Model  string
	Status string
	Prompt string
	Start  *time.Time
	End    *time.Time
}

// imageLogQuery 将列表、计数和图片访问限制在相同的管理员可见范围内。
func imageLogQuery(ctx context.Context, root bool) *gorm.DB {
	query := DB.WithContext(ctx).Model(&CreativeGeneration{}).
		Where("media_type = ? AND status <> ?", CreativeMediaTypeImage, CreativeGenerationStatusDeleted)
	if !root {
		// 保留已软删除账号的角色范围，防止历史图片因此变为普通管理员可见。
		roots := DB.WithContext(ctx).Unscoped().Model(&User{}).Select("id").Where("role = ?", common.RoleRootUser)
		query = query.Where("user_id NOT IN (?)", roots)
	}
	return query
}

func ListImageLogs(ctx context.Context, root bool, filter ImageLogFilter, offset, limit int) ([]CreativeGeneration, int64, error) {
	query := imageLogQuery(ctx, root)
	if filter.UserID > 0 {
		query = query.Where("user_id = ?", filter.UserID)
	}
	if filter.Model != "" {
		query = query.Where("model = ?", filter.Model)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Prompt != "" {
		query = query.Where("prompt LIKE ?", "%"+filter.Prompt+"%")
	}
	if filter.Start != nil {
		query = query.Where("created_at >= ?", *filter.Start)
	}
	if filter.End != nil {
		query = query.Where("created_at <= ?", *filter.End)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []CreativeGeneration
	err := query.Preload("Assets", func(db *gorm.DB) *gorm.DB { return db.Order("id ASC") }).
		Order("created_at DESC, id DESC").Offset(max(offset, 0)).Limit(min(max(limit, 1), 100)).Find(&rows).Error
	return rows, total, err
}

func GetImageLogAsset(ctx context.Context, root bool, generationID, assetID int64) (*CreativeAsset, bool, error) {
	query := imageLogQuery(ctx, root)
	var generation CreativeGeneration
	err := query.Where("id = ?", generationID).First(&generation).Error
	exists, err := RecordExist(err)
	if err != nil || !exists {
		return nil, false, err
	}
	return GetCreativeAsset(ctx, generation.UserID, generationID, assetID)
}
