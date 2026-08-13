package common

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

const requestInputLogLimit = 10 * 1024

type requestInputBuilder struct {
	builder   strings.Builder
	truncated bool
}

func (b *requestInputBuilder) add(label string, content string) {
	if b.truncated || strings.TrimSpace(content) == "" {
		return
	}
	if b.builder.Len() > 0 {
		b.write("\n\n")
	}
	b.write("[" + label + "]\n")
	b.write(content)
}

func (b *requestInputBuilder) write(value string) {
	if value == "" || b.truncated {
		return
	}
	remaining := requestInputLogLimit - b.builder.Len()
	if len(value) <= remaining {
		b.builder.WriteString(value)
		return
	}
	if remaining > 0 {
		end := remaining
		for end > 0 && !utf8.ValidString(value[:end]) {
			end--
		}
		b.builder.WriteString(value[:end])
	}
	b.truncated = true
}

func (b *requestInputBuilder) result() (string, bool) {
	return b.builder.String(), b.truncated
}

// ExtractRequestInput 提取客户端原始请求中的消息或 input 文本，供超级管理员排查调用。
// 图片、音频、文件及工具定义不写入日志，结果按 UTF-8 字节限制为 10 KiB。
func ExtractRequestInput(request dto.Request) (string, bool) {
	builder := &requestInputBuilder{}
	switch req := request.(type) {
	case *dto.GeneralOpenAIRequest:
		for _, message := range req.Messages {
			builder.add(message.Role, message.StringContent())
			addOpenAIToolCalls(builder, message.Role, message.ToolCalls)
			if builder.truncated {
				break
			}
		}
		if len(req.Messages) == 0 {
			addStringValues(builder, "input", req.Input)
			addStringValues(builder, "prompt", req.Prompt)
		}
	case *dto.OpenAIResponsesRequest:
		addResponsesInput(builder, req.Input)
	case *dto.OpenAIResponsesCompactionRequest:
		addResponsesInput(builder, req.Input)
	case *dto.ClaudeRequest:
		if req.System != nil {
			if req.IsStringSystem() {
				builder.add("system", req.GetStringSystem())
			} else {
				for _, part := range req.ParseSystem() {
					builder.add("system", claudePartText(part))
				}
			}
		}
		for _, message := range req.Messages {
			if message.IsStringContent() {
				builder.add(message.Role, message.GetStringContent())
				continue
			}
			parts, _ := message.ParseContent()
			for _, part := range parts {
				builder.add(message.Role, claudePartText(part))
				if builder.truncated {
					break
				}
			}
			if builder.truncated {
				break
			}
		}
	case *dto.GeminiChatRequest:
		if req.SystemInstructions != nil {
			addGeminiContent(builder, "system", *req.SystemInstructions)
		}
		for _, content := range req.Contents {
			addGeminiContent(builder, content.Role, content)
			if builder.truncated {
				break
			}
		}
	case *dto.EmbeddingRequest:
		for _, input := range req.ParseInput() {
			builder.add("input", input)
		}
	}
	return builder.result()
}

func addOpenAIToolCalls(builder *requestInputBuilder, role string, toolCalls []byte) {
	if len(toolCalls) == 0 {
		return
	}
	var calls []map[string]any
	if err := common.Unmarshal(toolCalls, &calls); err != nil {
		return
	}
	for _, call := range calls {
		function, ok := call["function"].(map[string]any)
		if !ok {
			continue
		}
		arguments, _ := function["arguments"].(string)
		name, _ := function["name"].(string)
		if name != "" && arguments != "" {
			builder.add(role, name+": "+arguments)
		} else {
			builder.add(role, arguments)
		}
	}
}

func addStringValues(builder *requestInputBuilder, label string, value any) {
	switch typed := value.(type) {
	case string:
		builder.add(label, typed)
	case []string:
		for _, item := range typed {
			builder.add(label, item)
		}
	case []any:
		for _, item := range typed {
			if text, ok := item.(string); ok {
				builder.add(label, text)
			}
		}
	}
}

func addResponsesInput(builder *requestInputBuilder, input []byte) {
	if len(input) == 0 {
		return
	}
	var value any
	if err := common.Unmarshal(input, &value); err != nil {
		return
	}
	addResponsesValue(builder, "input", value)
}

func addResponsesValue(builder *requestInputBuilder, label string, value any) {
	if builder.truncated {
		return
	}
	switch typed := value.(type) {
	case string:
		builder.add(label, typed)
	case []any:
		for _, item := range typed {
			addResponsesValue(builder, label, item)
		}
	case map[string]any:
		itemLabel := label
		if role, ok := typed["role"].(string); ok && role != "" {
			itemLabel = role
		} else if itemType, ok := typed["type"].(string); ok && itemType != "" && label == "input" {
			itemLabel = itemType
		}
		if content, ok := typed["content"]; ok {
			addResponsesValue(builder, itemLabel, content)
		}
		for _, key := range []string{"text", "arguments", "output"} {
			if text, ok := typed[key].(string); ok {
				builder.add(itemLabel, text)
			}
		}
	}
}

func claudePartText(part dto.ClaudeMediaMessage) string {
	switch part.Type {
	case "text":
		return part.GetText()
	case "tool_use":
		if part.Input != nil {
			return fmt.Sprintf("%s: %s", part.Name, common.GetJsonString(part.Input))
		}
	case "tool_result":
		switch content := part.Content.(type) {
		case string:
			return content
		case []any:
			texts := make([]string, 0, len(content))
			for _, item := range content {
				itemMap, ok := item.(map[string]any)
				if !ok || itemMap["type"] != "text" {
					continue
				}
				if text, ok := itemMap["text"].(string); ok && text != "" {
					texts = append(texts, text)
				}
			}
			return strings.Join(texts, "\n")
		}
	}
	return ""
}

func addGeminiContent(builder *requestInputBuilder, fallbackRole string, content dto.GeminiChatContent) {
	role := content.Role
	if role == "" {
		role = fallbackRole
	}
	for _, part := range content.Parts {
		builder.add(role, part.Text)
		if part.FunctionCall != nil {
			builder.add(role, fmt.Sprintf("%s: %s", part.FunctionCall.FunctionName, common.GetJsonString(part.FunctionCall.Arguments)))
		}
		if part.FunctionResponse != nil {
			builder.add(role, fmt.Sprintf("%s: %s", part.FunctionResponse.Name, common.GetJsonString(part.FunctionResponse.Response)))
		}
		if part.ExecutableCode != nil {
			builder.add(role, part.ExecutableCode.Code)
		}
		if part.CodeExecutionResult != nil {
			builder.add(role, part.CodeExecutionResult.Output)
		}
		if builder.truncated {
			break
		}
	}
}
