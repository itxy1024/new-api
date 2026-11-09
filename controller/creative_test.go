package controller

import (
	"encoding/base64"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
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
