package controller

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func newCreativeTestContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	return ctx
}

func TestSetCreativeGroupBindsSelectedTokenGroup(t *testing.T) {
	ctx := newCreativeTestContext()
	common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"vip", "default"})
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, "vip")

	require.NoError(t, setCreativeGroup(ctx, "default"))
	require.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup))
	require.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyTokenGroup))
	require.Equal(t, []string{"default"}, common.GetContextKeyStringSlice(ctx, constant.ContextKeyTokenGroups))
}

func TestSetCreativeGroupRejectsAutoForTokenWithoutAutoGroup(t *testing.T) {
	ctx := newCreativeTestContext()
	common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"vip"})

	err := setCreativeGroup(ctx, "auto")
	require.EqualError(t, err, "creative group is not available for this key")
}

func TestSetCreativeGroupAcceptsAutoForTokenWithAutoGroup(t *testing.T) {
	ctx := newCreativeTestContext()
	common.SetContextKey(ctx, constant.ContextKeyTokenGroups, []string{"auto"})

	require.NoError(t, setCreativeGroup(ctx, "auto"))
	require.Equal(t, "auto", common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup))
	require.Equal(t, []string{"auto"}, common.GetContextKeyStringSlice(ctx, constant.ContextKeyTokenGroups))
}

func TestGetCreativeUsableTokenGroupsKeepsOnlyCurrentlyAllowedGroups(t *testing.T) {
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"retired":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	groups := getCreativeUsableTokenGroups("default", []string{"retired", "default", "auto"})

	require.Equal(t, []string{"default", "auto"}, groups)
}

func TestGetCreativeUsableTokenGroupsRejectsRemovedGroupRatio(t *testing.T) {
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","removed":"Removed"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	require.Empty(t, getCreativeUsableTokenGroups("default", []string{"removed"}))
}

func TestCreativeModelsReturnsEmptyListForUnavailableKeyGroup(t *testing.T) {
	recorder := httptest.NewRecorder()
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(recorder)

	require.True(t, writeCreativeModelsUnavailableGroup(ctx, errCreativeKeyGroupUnavailable))
	require.Equal(t, 200, recorder.Code)
	require.JSONEq(t, `{"success":true,"data":[],"object":"list"}`, recorder.Body.String())
	require.False(t, writeCreativeModelsUnavailableGroup(ctx, errors.New("other error")))
}

func TestGetCreativeUsableTokenGroupsSupportsLegacyDefaultGroupFallback(t *testing.T) {
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	require.Equal(t, []string{"default"}, getCreativeUsableTokenGroups("default", nil))
}

func TestDecodeCreativeDataURL(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("image-data"))
	data, extension, err := decodeCreativeDataURL("data:image/jpeg;base64," + encoded)
	require.NoError(t, err)
	require.Equal(t, []byte("image-data"), data)
	require.Equal(t, ".jpg", extension)

	data, extension, err = decodeCreativeDataURL("data:text/plain,hello%20world")
	require.NoError(t, err)
	require.Equal(t, []byte("hello world"), data)
	require.Equal(t, ".png", extension)
}

func TestDecodeCreativeDataURLRejectsNonDataURL(t *testing.T) {
	_, _, err := decodeCreativeDataURL("https://example.com/image.png")
	require.EqualError(t, err, "image must be a data URL")
}

func TestCreativeImageExtendedParametersAndMarkup(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("image-data"))
	requestBody := `{"model":"gpt-image-2.6-sunburst","prompt":"edit","output_format":"gif","complexity":"high","frame_count":4,"frame_duration_ms":120,"images":["data:image/png;base64,` + encoded + `"],"markup":"data:image/png;base64,` + encoded + `"}`
	ctx := newCreativeTestContext()
	ctx.Request = httptest.NewRequest("POST", "/api/creative/images", strings.NewReader(requestBody))
	ctx.Request.Header.Set("Content-Type", "application/json")

	require.NoError(t, convertCreativeJSONEditToMultipart(ctx))
	require.NoError(t, ctx.Request.ParseMultipartForm(1<<20))
	require.Equal(t, "high", ctx.Request.FormValue("complexity"))
	require.Equal(t, "gif", ctx.Request.FormValue("output_format"))
	require.Equal(t, "4", ctx.Request.FormValue("frame_count"))
	require.Equal(t, "120", ctx.Request.FormValue("frame_duration_ms"))
	file, _, err := ctx.Request.FormFile("markup")
	require.NoError(t, err)
	defer file.Close()
	data, err := io.ReadAll(file)
	require.NoError(t, err)
	require.Equal(t, []byte("image-data"), data)
	require.Equal(t, "image/gif", creativeImageMimeType("gif"))
	require.Equal(t, "image/svg+xml", creativeImageMimeType("svg"))
}

func TestCreativeImageExtendedParameterLimits(t *testing.T) {
	count := 17
	require.EqualError(t, validateCreativeImageParameters(creativeRequestEnvelope{FrameCount: &count}), "creative frame_count must be between 2 and 16")
	duration := 2001
	require.EqualError(t, validateCreativeImageParameters(creativeRequestEnvelope{FrameDurationMS: &duration}), "creative frame_duration_ms must be between 20 and 2000")
	require.EqualError(t, validateCreativeImageParameters(creativeRequestEnvelope{Complexity: "extreme"}), "creative complexity is invalid")
}

func TestFormatCreativeTimeUsesLocalTimezone(t *testing.T) {
	value := time.Date(2026, 9, 10, 2, 20, 0, 0, time.UTC)
	require.Equal(t, "2026-09-10 10:20:00", formatCreativeTime(value))
}

// 使用隔离数据库验证配置加载、日志创建、图片上传与历史读取的完整链路。
// 默认使用 SQLite；三库检查通过环境变量传入专用测试库，禁止使用生产库。
func TestCreativeImagePersistenceFollowsConfiguredStorage(t *testing.T) {
	dialect := os.Getenv("CREATIVE_TEST_DB_DIALECT")
	dsn := os.Getenv("CREATIVE_TEST_DB_DSN")
	var driver gorm.Dialector
	switch dialect {
	case "mysql":
		require.NotEmpty(t, dsn)
		driver = mysql.Open(dsn)
	case "postgres":
		require.NotEmpty(t, dsn)
		driver = postgres.Open(dsn)
	default:
		require.Empty(t, dialect)
		dialect = "sqlite"
		driver = sqlite.Open(":memory:")
	}
	database, err := gorm.Open(driver, &gorm.Config{})
	require.NoError(t, err)
	versionQuery := "SELECT VERSION()"
	if dialect == "sqlite" {
		versionQuery = "SELECT sqlite_version()"
	}
	var databaseVersion string
	require.NoError(t, database.Raw(versionQuery).Scan(&databaseVersion).Error)
	t.Logf("数据库实际版本：%s %s", dialect, databaseVersion)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	previousDB, previousType := model.DB, common.MainDatabaseType()
	model.DB = database
	common.SetMainDatabaseType(common.DatabaseType(dialect))
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousType)
	})
	require.NoError(t, database.AutoMigrate(&model.CreativeGeneration{}, &model.CreativeAsset{}))
	require.NoError(t, database.AutoMigrate(&model.CreativeGeneration{}, &model.CreativeAsset{}))

	var uploaded []byte
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPut {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		content, readErr := io.ReadAll(request.Body)
		if readErr != nil {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		uploaded = content
		writer.Header().Set("ETag", `"creative-test"`)
		writer.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{
		system_setting.TaskArtifactStoreModeOption:         "s3",
		system_setting.TaskArtifactStoreS3EndpointOption:   server.URL,
		system_setting.TaskArtifactStoreS3BucketOption:     "creative-test",
		system_setting.TaskArtifactStoreS3RegionOption:     "us-east-1",
		system_setting.TaskArtifactStoreS3AccessKeyOption:  "fixture-access",
		system_setting.TaskArtifactStoreS3SecretKeyOption:  "fixture-secret",
		system_setting.TaskArtifactStoreS3PrefixOption:     "creative",
		system_setting.TaskArtifactStoreS3PathStyleOption:  "true",
		system_setting.TaskArtifactStoreS3PresignTTLOption: "900",
	}
	common.OptionMapRWMutex.Unlock()
	service.ReloadTaskArtifactStore()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
		service.ReloadTaskArtifactStore()
	})
	require.True(t, service.GetTaskArtifactStore().Enabled(), "已配置的 S3 不能被上游占位逻辑禁用")
	metadata := creativeRequestEnvelope{
		ClientTaskID: fmt.Sprintf("creative-persistence-%d", time.Now().UnixNano()),
		Model:        "creative-test-model", Prompt: "生成灯塔", Size: "1024x1024", Quality: "high",
	}
	startedAt := model.CreativeNow()
	generation := beginCreativeImageGeneration(metadata, 31, 17, "premium", startedAt)
	require.NotNil(t, generation)
	assert.Equal(t, model.CreativeGenerationStatusProcessing, generation.Status)
	// 重复读取同一任务不能插入重复日志。
	duplicate := beginCreativeImageGeneration(metadata, 31, 17, "premium", startedAt)
	require.NotNil(t, duplicate)
	assert.Equal(t, generation.ID, duplicate.ID)
	const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	body, err := common.Marshal(map[string]any{"data": []map[string]string{{"b64_json": png}}})
	require.NoError(t, err)
	persistCreativeImageResponse(metadata, generation, 31, 17, "premium", startedAt, 1234, body)
	stored, exists, err := model.GetCreativeGeneration(t.Context(), 31, generation.ID)
	require.NoError(t, err)
	require.True(t, exists)
	assert.Equal(t, metadata.Prompt, stored.Prompt)
	assert.Equal(t, "premium", stored.Group)
	assert.Equal(t, model.CreativeGenerationStatusCompleted, stored.Status)
	assert.EqualValues(t, 1234, stored.ElapsedMS)
	require.NotNil(t, stored.FinishedAt)
	require.Len(t, stored.Assets, 1)
	assert.EqualValues(t, len(uploaded), stored.Assets[0].ByteSize)
	expectedImage, err := base64.StdEncoding.DecodeString(png)
	require.NoError(t, err)
	assert.Equal(t, expectedImage, uploaded)
	assert.Equal(t, 1, stored.Assets[0].Width)
	assert.Equal(t, 1, stored.Assets[0].Height)
	assert.Contains(t, stored.OutputURLs, stored.Assets[0].PublicURL)
	_, exists, err = model.GetCreativeGeneration(t.Context(), 32, generation.ID)
	require.NoError(t, err)
	assert.False(t, exists)

	metadata.ClientTaskID += "-failed"
	failed := beginCreativeImageGeneration(metadata, 31, 17, "premium", startedAt)
	require.NotNil(t, failed)
	persistCreativeImageResponse(metadata, failed, 31, 17, "premium", startedAt, 250, []byte(`{"data":[]}`))
	failed, exists, err = model.GetCreativeGeneration(t.Context(), 31, failed.ID)
	require.NoError(t, err)
	require.True(t, exists)
	assert.Equal(t, model.CreativeGenerationStatusFailed, failed.Status)
	assert.NotEmpty(t, failed.ErrorMessage)
	require.NotNil(t, failed.FinishedAt)
}
