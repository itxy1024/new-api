package common

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractRequestInputOnlyIncludesUserMessages(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{
		{Role: "system", Content: "follow policy"},
		{Role: "developer", Content: "developer instruction"},
		{Role: "user", Content: []any{
			map[string]any{"type": "text", "text": "hello"},
			map[string]any{"type": "image_url", "image_url": "data:image/png;base64,secret"},
		}},
		{Role: "assistant", Content: "answer", ToolCalls: []byte(`[{"function":{"name":"weather","arguments":"{\"city\":\"Shanghai\"}"}}]`)},
		{Role: "tool", Content: "tool result"},
	}}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Equal(t, "[user]\nhello", content)
	assert.NotContains(t, content, "base64")
	assert.NotContains(t, content, "developer instruction")
	assert.NotContains(t, content, "follow policy")
	assert.NotContains(t, content, "tool result")
}

func TestExtractRequestInputIgnoresLargeDeveloperPromptBeforeUserMessage(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{Messages: []dto.Message{
		{Role: "developer", Content: strings.Repeat("internal instruction", requestInputLogLimit)},
		{Role: "user", Content: "actual user input"},
	}}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Equal(t, "[user]\nactual user input", content)
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
	assert.NotContains(t, content, "Shanghai")
	assert.NotContains(t, content, "sunny")
	assert.NotContains(t, content, "base64")
}

func TestExtractRequestInputExcludesClaudeToolResultMedia(t *testing.T) {
	request := &dto.ClaudeRequest{
		System: []any{"system secret"},
		Messages: []dto.ClaudeMessage{
			{Role: "assistant", Content: "assistant secret"},
			{Role: "user", Content: []any{
				map[string]any{"type": "text", "text": "user text"},
				map[string]any{
					"type": "tool_result",
					"content": []any{
						map[string]any{"type": "text", "text": "tool text"},
						map[string]any{"type": "image", "source": map[string]any{"data": "base64-secret"}},
					},
				},
			}},
		},
	}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Equal(t, "[user]\nuser text", content)
	assert.NotContains(t, content, "system secret")
	assert.NotContains(t, content, "assistant secret")
	assert.NotContains(t, content, "tool text")
	assert.NotContains(t, content, "base64-secret")
}

func TestExtractRequestInputOnlyIncludesGeminiUserContent(t *testing.T) {
	request := &dto.GeminiChatRequest{
		SystemInstructions: &dto.GeminiChatContent{Parts: []dto.GeminiPart{{Text: "system secret"}}},
		Contents: []dto.GeminiChatContent{
			{Role: "user", Parts: []dto.GeminiPart{{Text: "user text"}}},
			{Role: "model", Parts: []dto.GeminiPart{{Text: "model secret"}}},
		},
	}

	content, truncated := ExtractRequestInput(request)

	require.False(t, truncated)
	assert.Equal(t, "[user]\nuser text", content)
	assert.NotContains(t, content, "system secret")
	assert.NotContains(t, content, "model secret")
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
