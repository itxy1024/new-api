package model

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateCreativeGenerationTimestampsFromUnixSeconds(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Exec(`
CREATE TABLE creative_generations (
  id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
)`).Error)
	require.NoError(t, database.Exec(`
INSERT INTO creative_generations (id, created_at, finished_at)
VALUES (1, 1789010400, 1789010405)`).Error)
	require.NoError(t, database.Exec(`
CREATE TABLE creative_assets (
  id INTEGER PRIMARY KEY,
  generation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  asset_key TEXT NOT NULL,
  storage_backend TEXT NOT NULL,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`).Error)
	require.NoError(t, database.Exec(`
INSERT INTO creative_assets (id, generation_id, user_id, asset_key, storage_backend, bucket, object_key, created_at)
VALUES (1, 1, 7, 'image-1', 's3', 'artifacts', 'image-1.png', 1789010410)`).Error)

	require.NoError(t, migrateCreativeGenerationTimestamps(database))
	// SQLite 的列亲和性仍可能是 INTEGER，迁移必须可重复执行。
	require.NoError(t, migrateCreativeGenerationTimestamps(database))
	require.NoError(t, database.AutoMigrate(&CreativeGeneration{}, &CreativeAsset{}))

	var generation CreativeGeneration
	require.NoError(t, database.First(&generation, 1).Error)
	assert.Equal(t, time.Unix(1789010400, 0).UTC().Add(8*time.Hour).Format("2006-01-02 15:04:05"), generation.CreatedAt.Format("2006-01-02 15:04:05"))
	require.NotNil(t, generation.FinishedAt)
	assert.Equal(t, time.Unix(1789010405, 0).UTC().Add(8*time.Hour).Format("2006-01-02 15:04:05"), generation.FinishedAt.Format("2006-01-02 15:04:05"))
	var asset CreativeAsset
	require.NoError(t, database.First(&asset, 1).Error)
	assert.Equal(t, time.Unix(1789010410, 0).UTC().Add(8*time.Hour).Format("2006-01-02 15:04:05"), asset.CreatedAt.Format("2006-01-02 15:04:05"))
}

func TestMigrateCreativeDateTimeTimezoneOnce(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.Exec(`CREATE TABLE creative_generations (id INTEGER PRIMARY KEY, created_at DATETIME NOT NULL, finished_at DATETIME)`).Error)
	require.NoError(t, database.Exec(`INSERT INTO creative_generations VALUES (1, '2026-09-10 02:00:00', '2026-09-10 02:00:05')`).Error)
	require.NoError(t, migrateCreativeGenerationTimestamps(database))
	require.NoError(t, migrateCreativeGenerationTimestamps(database))
	var createdAt, finishedAt string
	row, err := database.Raw("SELECT created_at, finished_at FROM creative_generations WHERE id = 1").Row()
	require.NoError(t, err)
	require.NoError(t, row.Scan(&createdAt, &finishedAt))
	assert.Equal(t, "2026-09-10 10:00:00", createdAt)
	assert.Equal(t, "2026-09-10 10:00:05", finishedAt)
}

func TestNormalizeMySQLTimeZoneDSN(t *testing.T) {
	assert.Equal(t,
		"user:pass@tcp(localhost:3306)/db?loc=Asia%2FShanghai&parseTime=true",
		normalizeMySQLTimeZoneDSN("user:pass@tcp(localhost:3306)/db?parseTime=false&loc=UTC"),
	)
}
