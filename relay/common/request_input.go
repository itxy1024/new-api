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
// 仅保留用户实际输入；系统、开发者、助手、工具内容及多媒体不写入日志，结果按 UTF-8 字节限制为 10 KiB。
func ExtractRequestInput(request dto.Request) (string, bool) {
	builder := &requestInputBuilder{}
	switch req := request.(type) {
	case *dto.GeneralOpenAIRequest:
		for _, message := range req.Messages {
			if !isUserRole(message.Role) {
				continue
			}
			builder.add(message.Role, message.StringContent())
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
		for _, message := range req.Messages {
			if !isUserRole(message.Role) {
				continue
			}
			if message.IsStringContent() {
				builder.add(message.Role, message.GetStringContent())
				continue
			}
			parts, _ := message.ParseContent()
			for _, part := range parts {
				if part.Type == "text" {
					builder.add(message.Role, claudePartText(part))
				}
				if builder.truncated {
					break
				}
			}
			if builder.truncated {
				break
			}
		}
	case *dto.GeminiChatRequest:
		for _, content := range req.Contents {
			if content.Role != "" && !isUserRole(content.Role) {
				continue
			}
			addGeminiContent(builder, "user", content)
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
		if role, ok := typed["role"].(string); ok && role != "" && !isUserRole(role) {
			return
		}
		if itemType, ok := typed["type"].(string); ok {
			switch itemType {
			case "function_call", "function_call_output":
				return
			}
		}
		if content, ok := typed["content"]; ok {
			addResponsesValue(builder, "user", content)
		}
		for _, key := range []string{"text"} {
			if text, ok := typed[key].(string); ok {
				builder.add("user", text)
			}
		}
	}
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
