package helper

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizeResponsesInputMessageIDs(t *testing.T) {
	tests := []struct {
		name             string
		input            string
		wantCleanedCount int
		assertResult     func(t *testing.T, result json.RawMessage)
	}{
		{
			name:             "字符串输入保持不变",
			input:            `"你好"`,
			wantCleanedCount: 0,
			assertResult: func(t *testing.T, result json.RawMessage) {
				assert.JSONEq(t, `"你好"`, string(result))
			},
		},
		{
			name:             "删除消息的非法 item ID 并保留内容",
			input:            `[{"type":"message","id":"item_123","role":"assistant","content":[{"type":"output_text","text":"你好"}]}]`,
			wantCleanedCount: 1,
			assertResult: func(t *testing.T, result json.RawMessage) {
				var items []map[string]json.RawMessage
				require.NoError(t, common.Unmarshal(result, &items))
				require.Len(t, items, 1)
				assert.NotContains(t, items[0], "id")
				assert.JSONEq(t, `[{"type":"output_text","text":"你好"}]`, string(items[0]["content"]))
			},
		},
		{
			name:             "合法消息 ID 保持不变",
			input:            `[{"type":"message","id":"msg_123","role":"assistant","content":[]}]`,
			wantCleanedCount: 0,
			assertResult: func(t *testing.T, result json.RawMessage) {
				assert.JSONEq(t, `[{"type":"message","id":"msg_123","role":"assistant","content":[]}]`, string(result))
			},
		},
		{
			name:             "工具调用 ID 和 call_id 保持不变",
			input:            `[{"type":"function_call","id":"item_call_123","call_id":"call_123","name":"lookup","arguments":"{}"}]`,
			wantCleanedCount: 0,
			assertResult: func(t *testing.T, result json.RawMessage) {
				assert.JSONEq(t, `[{"type":"function_call","id":"item_call_123","call_id":"call_123","name":"lookup","arguments":"{}"}]`, string(result))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, cleanedCount, err := SanitizeResponsesInputMessageIDs(json.RawMessage(tt.input))
			require.NoError(t, err)
			assert.Equal(t, tt.wantCleanedCount, cleanedCount)
			tt.assertResult(t, result)
		})
	}
}

func TestSanitizeResponsesRequestMessageIDsPreservesUnknownFields(t *testing.T) {
	body := []byte(`{
		"model":"gpt-test",
		"input":[{"type":"message","id":"item_123","role":"assistant","content":"历史消息"}],
		"unknown_field":{"enabled":true}
	}`)

	result, cleanedCount, err := SanitizeResponsesRequestMessageIDs(body)
	require.NoError(t, err)
	assert.Equal(t, 1, cleanedCount)

	var request map[string]json.RawMessage
	require.NoError(t, common.Unmarshal(result, &request))
	assert.JSONEq(t, `{"enabled":true}`, string(request["unknown_field"]))

	var items []map[string]json.RawMessage
	require.NoError(t, common.Unmarshal(request["input"], &items))
	require.Len(t, items, 1)
	assert.NotContains(t, items[0], "id")
	assert.JSONEq(t, `"历史消息"`, string(items[0]["content"]))
}
