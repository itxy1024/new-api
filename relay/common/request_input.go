package common

import (
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
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

func isUserRole(role string) bool {
	return strings.EqualFold(strings.TrimSpace(role), "user")
}

// ExtractRequestInput 提取客户端原始请求中的消息或 input 文本，供超级管理员排查调用。
// 仅保留本次请求最后一条用户输入；系统、开发者、助手、工具内容及多媒体不写入日志，结果按 UTF-8 字节限制为 10 KiB。
func ExtractRequestInput(request dto.Request) (string, bool) {
	builder := &requestInputBuilder{}
	switch req := request.(type) {
	case *dto.GeneralOpenAIRequest:
		for index := len(req.Messages) - 1; index >= 0; index-- {
			message := req.Messages[index]
			if isUserRole(message.Role) {
				builder.add("user", message.StringContent())
				break
			}
		}
		if len(req.Messages) == 0 {
			addLastStringValue(builder, "input", req.Input)
			addLastStringValue(builder, "prompt", req.Prompt)
		}
	case *dto.OpenAIResponsesRequest:
		addResponsesInput(builder, req.Input)
	case *dto.OpenAIResponsesCompactionRequest:
		addResponsesInput(builder, req.Input)
	case *dto.ClaudeRequest:
		for index := len(req.Messages) - 1; index >= 0; index-- {
			message := req.Messages[index]
			if !isUserRole(message.Role) {
				continue
			}
			if message.IsStringContent() {
				builder.add("user", message.GetStringContent())
				break
			}
			parts, _ := message.ParseContent()
			for _, part := range parts {
				if part.Type == "text" {
					builder.add("user", claudePartText(part))
				}
			}
			break
		}
	case *dto.GeminiChatRequest:
		for index := len(req.Contents) - 1; index >= 0; index-- {
			content := req.Contents[index]
			if content.Role != "" && !isUserRole(content.Role) {
				continue
			}
			addGeminiContent(builder, "user", content)
			break
		}
	case *dto.EmbeddingRequest:
		inputs := req.ParseInput()
		if len(inputs) > 0 {
			builder.add("input", inputs[len(inputs)-1])
		}
	}
	return builder.result()
}

func addLastStringValue(builder *requestInputBuilder, label string, value any) {
	switch typed := value.(type) {
	case string:
		builder.add(label, typed)
	case []string:
		if len(typed) > 0 {
			builder.add(label, typed[len(typed)-1])
		}
	case []any:
		for index := len(typed) - 1; index >= 0; index-- {
			if text, ok := typed[index].(string); ok {
				builder.add(label, text)
				break
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
	builder.add("user", lastResponsesUserText(value))
}

func lastResponsesUserText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case []any:
		for index := len(typed) - 1; index >= 0; index-- {
			if text := lastResponsesUserText(typed[index]); strings.TrimSpace(text) != "" {
				return text
			}
		}
	case map[string]any:
		if role, ok := typed["role"].(string); ok && role != "" && !isUserRole(role) {
			return ""
		}
		if itemType, ok := typed["type"].(string); ok {
			switch itemType {
			case "function_call", "function_call_output":
				return ""
			}
		}
		if content, ok := typed["content"]; ok {
			return lastResponsesUserText(content)
		}
		if text, ok := typed["text"].(string); ok {
			return text
		}
	}
	return ""
}

func claudePartText(part dto.ClaudeMediaMessage) string {
	if part.Type == "text" {
		return part.GetText()
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
		if builder.truncated {
			break
		}
	}
}
