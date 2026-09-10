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

	require.NoError(t, migrateCreativeGenerationTimestamps(database))
	require.NoError(t, database.AutoMigrate(&CreativeGeneration{}, &CreativeAsset{}))

	var generation CreativeGeneration
	require.NoError(t, database.First(&generation, 1).Error)
	assert.Equal(t, time.Unix(1789010400, 0).UTC(), generation.CreatedAt.UTC())
	require.NotNil(t, generation.FinishedAt)
	assert.Equal(t, time.Unix(1789010405, 0).UTC(), generation.FinishedAt.UTC())
}
