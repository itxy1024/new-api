package common

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/dto"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractRequestInputPreservesAllMessageRoles(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{
		{Role: "system", Content: "follow policy"},
		{Role: "user", Content: []any{
			map[string]any{"type": "text", "text": "hello"},
			map[string]any{"type": "image_url", "image_url": "data:image/png;base64,secret"},
		}},
		{Role: "assistant", Content: "answer", ToolCalls: []byte(`[{"function":{"name":"weather","arguments":"{\"city\":\"Shanghai\"}"}}]`)},
		{Role: "tool", Content: "tool result"},
	}}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Equal(t, "[system]\nfollow policy\n\n[user]\nhello\n\n[assistant]\nanswer\n\n[assistant]\nweather: {\"city\":\"Shanghai\"}\n\n[tool]\ntool result", content)
	assert.NotContains(t, content, "base64")
}

func TestExtractRequestInputReadsResponsesTextAndToolPayloads(t *testing.T) {
	request := &dto.OpenAIResponsesRequest{Input: []byte(`[
		{"role":"user","content":[{"type":"input_text","text":"question"},{"type":"input_image","image_url":"data:image/png;base64,secret"}]},
		{"type":"function_call","arguments":"{\"city\":\"Shanghai\"}"},
		{"type":"function_call_output","output":"sunny"}
	]`)}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Contains(t, content, "[user]\nquestion")
	assert.Contains(t, content, "[function_call]\n{\"city\":\"Shanghai\"}")
	assert.Contains(t, content, "[function_call_output]\nsunny")
	assert.NotContains(t, content, "base64")
}

func TestExtractRequestInputExcludesClaudeToolResultMedia(t *testing.T) {
	request := &dto.ClaudeRequest{Messages: []dto.ClaudeMessage{{
		Role: "user",
		Content: []any{map[string]any{
			"type": "tool_result",
			"content": []any{
				map[string]any{"type": "text", "text": "tool text"},
				map[string]any{"type": "image", "source": map[string]any{"data": "base64-secret"}},
			},
		}},
	}}}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Equal(t, "[user]\ntool text", content)
	assert.NotContains(t, content, "base64-secret")
}

func TestExtractRequestInputTruncatesAtValidUTF8Boundary(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{
		Role:    "user",
		Content: strings.Repeat("中", requestInputLogLimit),
	}}}

	content, truncated := ExtractRequestInput(request)

	require.True(t, truncated)
	assert.LessOrEqual(t, len(content), requestInputLogLimit)
	assert.True(t, utf8.ValidString(content))
}
