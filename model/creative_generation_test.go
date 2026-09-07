package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestCreativeGenerationQueriesEnforceUserOwnership(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&CreativeGeneration{}, &CreativeAsset{}))

	originalDB := DB
	DB = database
	t.Cleanup(func() { DB = originalDB })

	first := &CreativeGeneration{
		ClientTaskID: "shared-client-id",
		UserID:       101,
		MediaType:    CreativeMediaTypeImage,
		Status:       CreativeGenerationStatusCompleted,
		CreatedAt:    10,
	}
	second := &CreativeGeneration{
		ClientTaskID: "shared-client-id",
		UserID:       202,
		MediaType:    CreativeMediaTypeImage,
		Status:       CreativeGenerationStatusCompleted,
		CreatedAt:    20,
	}
	require.NoError(t, InsertCreativeGeneration(t.Context(), first))
	require.NoError(t, InsertCreativeGeneration(t.Context(), second))
	require.NoError(t, InsertCreativeAsset(t.Context(), &CreativeAsset{
		GenerationID:   first.ID,
		UserID:         first.UserID,
		AssetKey:       "image-2",
		StorageBackend: "s3",
		Bucket:         "artifacts",
		ObjectKey:      "first/image-2.png",
		CreatedAt:      12,
	}))
	require.NoError(t, InsertCreativeAsset(t.Context(), &CreativeAsset{
		GenerationID:   first.ID,
		UserID:         first.UserID,
		AssetKey:       "image-1",
		StorageBackend: "s3",
		Bucket:         "artifacts",
		ObjectKey:      "first/image-1.png",
		CreatedAt:      11,
	}))

	items, err := ListCreativeGenerations(t.Context(), first.UserID, CreativeMediaTypeImage, 10)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Len(t, items[0].Assets, 2)
	assert.Less(t, items[0].Assets[0].ID, items[0].Assets[1].ID)

	_, exists, err := GetCreativeAsset(t.Context(), second.UserID, first.ID, items[0].Assets[0].ID)
	require.NoError(t, err)
	assert.False(t, exists)

	require.NoError(t, DeleteCreativeGeneration(t.Context(), first.UserID, first.ID))
	_, exists, err = GetCreativeGenerationByClientTaskID(t.Context(), second.UserID, second.ClientTaskID)
	require.NoError(t, err)
	assert.True(t, exists)
}
