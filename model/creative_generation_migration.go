package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// migrateCreativeGenerationTimestamps 将旧版 Unix 秒时间迁移为数据库时间类型。
func migrateCreativeGenerationTimestamps(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("创作记录时间迁移：数据库为空")
	}
	for _, table := range []string{"creative_generations", "creative_assets"} {
		if !db.Migrator().HasTable(table) {
			continue
		}
		for _, column := range []string{"created_at", "finished_at"} {
			if table == "creative_assets" && column == "finished_at" {
				continue
			}
			dataType, err := creativeColumnDataType(db, table, column)
			if err != nil {
				return err
			}
			if !isCreativeUnixColumn(dataType) {
				continue
			}
			if err := migrateCreativeUnixColumn(db, table, column); err != nil {
				return err
			}
		}
	}
	return nil
}

// migrateCreativeGenerationOutputURLs 回填旧资产的固定地址，方便直接在生成表查看结果。
func migrateCreativeGenerationOutputURLs(db *gorm.DB) error {
	if db == nil || !db.Migrator().HasTable("creative_generations") || !db.Migrator().HasTable("creative_assets") {
		return nil
	}
	var assets []struct {
		GenerationID int64  `gorm:"column:generation_id"`
		PublicURL    string `gorm:"column:public_url"`
	}
	if err := db.Table("creative_assets").
		Select("generation_id, public_url").
		Where("public_url IS NOT NULL AND public_url <> ?", "").
		Find(&assets).Error; err != nil {
		return fmt.Errorf("读取创作结果地址失败：%w", err)
	}
	urlsByGeneration := make(map[int64][]string)
	for _, asset := range assets {
		url := strings.TrimSpace(asset.PublicURL)
		if url == "" {
			continue
		}
		seen := false
		for _, existing := range urlsByGeneration[asset.GenerationID] {
			if existing == url {
				seen = true
				break
			}
		}
		if !seen {
			urlsByGeneration[asset.GenerationID] = append(urlsByGeneration[asset.GenerationID], url)
		}
	}
	for generationID, urls := range urlsByGeneration {
		encoded, err := common.Marshal(urls)
		if err != nil {
			return fmt.Errorf("编码创作结果地址失败：%w", err)
		}
		if err := db.Model(&CreativeGeneration{}).
			Where("id = ? AND (output_urls IS NULL OR output_urls = ?)", generationID, "").
			Update("output_urls", string(encoded)).Error; err != nil {
			return fmt.Errorf("回填创作结果地址失败：%w", err)
		}
	}
	return nil
}

func creativeColumnDataType(db *gorm.DB, table, column string) (string, error) {
	var dataType string
	switch db.Dialector.Name() {
	case "sqlite":
		var columns []struct {
			Name string `gorm:"column:name"`
			Type string `gorm:"column:type"`
		}
		if err := db.Raw("PRAGMA table_info(" + table + ")").Scan(&columns).Error; err != nil {
			return "", fmt.Errorf("读取 %s.%s 类型失败：%w", table, column, err)
		}
		for _, item := range columns {
			if strings.EqualFold(item.Name, column) {
				return item.Type, nil
			}
		}
		return "", nil
	case "mysql":
		err := db.Raw(`SELECT data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, table, column).Scan(&dataType).Error
		return dataType, err
	case "postgres":
		err := db.Raw(`SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`, table, column).Scan(&dataType).Error
		return dataType, err
	default:
		return "", nil
	}
}

func isCreativeUnixColumn(dataType string) bool {
	dataType = strings.ToLower(strings.TrimSpace(dataType))
	return strings.Contains(dataType, "int") || strings.Contains(dataType, "numeric")
}

func migrateCreativeUnixColumn(db *gorm.DB, table, column string) error {
	quoted := table + "." + column
	switch db.Dialector.Name() {
	case "sqlite":
		if column == "finished_at" {
			return db.Exec("UPDATE " + table + " SET " + column + " = CASE WHEN " + quoted + " > 0 THEN datetime(" + column + ", 'unixepoch') ELSE NULL END").Error
		}
		return db.Exec("UPDATE " + table + " SET " + column + " = datetime(" + column + ", 'unixepoch') WHERE " + column + " > 0").Error
	case "mysql":
		if column == "finished_at" {
			if err := db.Exec("UPDATE " + table + " SET " + column + " = CASE WHEN " + column + " > 0 THEN FROM_UNIXTIME(" + column + ") ELSE NULL END").Error; err != nil {
				return err
			}
			return db.Exec("ALTER TABLE " + table + " MODIFY COLUMN " + column + " DATETIME NULL").Error
		}
		if err := db.Exec("UPDATE " + table + " SET " + column + " = FROM_UNIXTIME(" + column + ") WHERE " + column + " > 0").Error; err != nil {
			return err
		}
		return db.Exec("ALTER TABLE " + table + " MODIFY COLUMN " + column + " DATETIME NOT NULL").Error
	case "postgres":
		if column == "finished_at" {
			return db.Exec("ALTER TABLE " + table + " ALTER COLUMN " + column + " TYPE TIMESTAMP USING CASE WHEN " + column + " IS NULL OR " + column + " = 0 THEN NULL ELSE to_timestamp(" + column + ") END").Error
		}
		return db.Exec("ALTER TABLE " + table + " ALTER COLUMN " + column + " TYPE TIMESTAMP USING to_timestamp(" + column + ")").Error
	default:
		return nil
	}
}
