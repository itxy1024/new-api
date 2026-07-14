package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/require"
)

// TestFormatUserLogsStripsQuotaSaturation verifies the admin-only quota
// saturation marker (nested under other.admin_info) is removed for non-admin
// log views, since formatUserLogs strips the whole admin_info object.
func TestFormatUserLogsStripsQuotaSaturation(t *testing.T) {
	other := common.MapToJsonStr(map[string]interface{}{
		"model_price": 0.004,
		"admin_info": map[string]interface{}{
			"quota_saturation": map[string]interface{}{
				"op":      "QuotaFromDecimal",
				"kind":    "overflow",
				"clamped": common.MaxQuota,
			},
		},
	})
	logs := []*Log{{Other: other}}

	formatUserLogs(logs, 0)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	_, hasAdminInfo := parsed["admin_info"]
	require.False(t, hasAdminInfo, "admin_info (and nested quota_saturation) must be stripped for non-admin views")
	// Non-admin billing fields remain visible.
	require.Contains(t, parsed, "model_price")
}

func TestHideLogChannelInfoOnlyRemovesChannelMetadata(t *testing.T) {
	other := common.MapToJsonStr(map[string]interface{}{
		"admin_info": map[string]interface{}{
			"admin_id":         7,
			"use_channel":      []interface{}{11, 12},
			"channel_affinity": map[string]interface{}{"rule_name": "sticky"},
			"is_multi_key":     true,
			"multi_key_index":  2,
		},
	})
	logs := []*Log{{ChannelId: 12, ChannelName: "secret", Other: other}}

	HideLogChannelInfo(logs)

	require.Zero(t, logs[0].ChannelId)
	require.Empty(t, logs[0].ChannelName)
	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	adminInfo, ok := parsed["admin_info"].(map[string]interface{})
	require.True(t, ok)
	require.EqualValues(t, 7, adminInfo["admin_id"])
	require.NotContains(t, adminInfo, "use_channel")
	require.NotContains(t, adminInfo, "channel_affinity")
	require.NotContains(t, adminInfo, "is_multi_key")
	require.NotContains(t, adminInfo, "multi_key_index")
}
