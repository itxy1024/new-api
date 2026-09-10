package service

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestS3ArtifactStorePersistsStreamAndMetadata(t *testing.T) {
	const content = "generated-media-content"
	var uploaded []byte
	var uploadErr error
	deleteCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodDelete {
			deleteCount++
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		if request.Method != http.MethodPut {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		uploaded, uploadErr = io.ReadAll(request.Body)
		if uploadErr != nil {
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		writer.Header().Set("ETag", `"test-etag"`)
		writer.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, database.AutoMigrate(&model.CreativeGeneration{}, &model.CreativeAsset{}))
	originalDB := model.DB
	model.DB = database
	t.Cleanup(func() { model.DB = originalDB })

	generation := &model.CreativeGeneration{
		ClientTaskID: "client-task",
		UserID:       31,
		MediaType:    model.CreativeMediaTypeImage,
		Status:       model.CreativeGenerationStatusProcessing,
		CreatedAt:    time.Unix(1, 0),
	}
	require.NoError(t, model.InsertCreativeGeneration(t.Context(), generation))

	storeValue, err := newTaskArtifactStore(system_setting.TaskArtifactStoreConfig{
		Mode:                system_setting.TaskArtifactStoreModeS3,
		S3Endpoint:          server.URL,
		S3Bucket:            "artifacts",
		S3Region:            "us-east-1",
		S3AccessKey:         "access-key",
		S3SecretKey:         "secret-key",
		S3Prefix:            "newapi",
		S3PathStyle:         true,
		S3PresignTTLSeconds: 900,
	})
	require.NoError(t, err)
	store := storeValue.(*s3ArtifactStore)

	ref, err := store.persistCreativeAsset(t.Context(), CreativeAssetUpload{
		GenerationID: generation.ID,
		UserID:       generation.UserID,
		MediaType:    model.CreativeMediaTypeImage,
		AssetKey:     "image-1",
		MimeType:     "image/png",
		Width:        1024,
		Height:       1024,
	}, strings.NewReader(content))
	require.NoError(t, err)
	require.NotNil(t, ref)
	require.NoError(t, uploadErr)
	assert.Equal(t, content, string(uploaded))
	assert.Equal(t, int64(len(content)), ref.Size)
	assert.Contains(t, ref.PublicURL, "/artifacts/newapi/creative/31/image/")

	asset, exists, err := model.GetCreativeAssetByGenerationKey(
		t.Context(), generation.UserID, generation.ID, "image-1",
	)
	require.NoError(t, err)
	require.True(t, exists)
	expectedChecksum := sha256.Sum256([]byte(content))
	assert.Equal(t, hex.EncodeToString(expectedChecksum[:]), asset.Checksum)
	assert.Equal(t, 1024, asset.Width)
	assert.Equal(t, 1024, asset.Height)
	assert.Equal(t, ref.PublicURL, asset.PublicURL)

	deletedGeneration := &model.CreativeGeneration{
		ClientTaskID: "deleted-client-task",
		UserID:       31,
		MediaType:    model.CreativeMediaTypeImage,
		Status:       model.CreativeGenerationStatusDeleted,
		CreatedAt:    time.Unix(2, 0),
	}
	require.NoError(t, model.InsertCreativeGeneration(t.Context(), deletedGeneration))
	_, err = store.persistCreativeAsset(t.Context(), CreativeAssetUpload{
		GenerationID: deletedGeneration.ID,
		UserID:       deletedGeneration.UserID,
		MediaType:    model.CreativeMediaTypeImage,
		AssetKey:     "image-1",
		MimeType:     "image/png",
	}, strings.NewReader(content))
	assert.ErrorIs(t, err, model.ErrCreativeGenerationInactive)
	assert.Equal(t, 1, deleteCount)
}

func TestCreativeAssetPublicURL(t *testing.T) {
	tests := []struct {
		name      string
		config    system_setting.TaskArtifactStoreConfig
		bucket    string
		objectKey string
		expected  string
	}{
		{
			name: "阿里云虚拟主机地址",
			config: system_setting.TaskArtifactStoreConfig{
				S3Endpoint: "https://oss-cn-shanghai.aliyuncs.com",
			},
			bucket:    "lebozntc-test-oss",
			objectKey: "canvas/creative/1/image/image 1.png",
			expected:  "https://lebozntc-test-oss.oss-cn-shanghai.aliyuncs.com/canvas/creative/1/image/image%201.png",
		},
		{
			name: "路径样式地址",
			config: system_setting.TaskArtifactStoreConfig{
				S3Endpoint:  "https://objects.example.com/storage",
				S3PathStyle: true,
			},
			bucket:    "creative-assets",
			objectKey: "canvas/image.png",
			expected:  "https://objects.example.com/storage/creative-assets/canvas/image.png",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := creativeAssetPublicURL(test.config, test.bucket, test.objectKey)
			require.NoError(t, err)
			assert.Equal(t, test.expected, actual)
		})
	}
}
