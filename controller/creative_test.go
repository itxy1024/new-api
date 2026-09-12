package controller

import (
	"encoding/base64"
	"errors"
	"net/http/httptest"
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

func TestFormatCreativeTimeUsesLocalTimezone(t *testing.T) {
	value := time.Date(2026, 9, 10, 2, 20, 0, 0, time.UTC)
	require.Equal(t, "2026-09-10 10:20:00", formatCreativeTime(value))
}
