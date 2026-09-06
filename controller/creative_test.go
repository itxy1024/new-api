package controller

import (
	"encoding/base64"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
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
