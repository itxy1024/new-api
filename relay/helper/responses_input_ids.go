package helper

import (
	"encoding/json"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// SanitizeResponsesInputMessageIDs 删除 Responses 历史消息中不符合上游要求的 message ID。
// 消息内容、工具调用关联字段以及其他类型条目的 ID 均保持不变。
func SanitizeResponsesInputMessageIDs(input json.RawMessage) (json.RawMessage, int, error) {
	if len(input) == 0 {
		return input, 0, nil
	}

	var items []json.RawMessage
	if err := common.Unmarshal(input, &items); err != nil {
		// Responses API 同时支持字符串 input；非数组形态无需处理。
		return input, 0, nil
	}

	cleanedCount := 0
	for index, rawItem := range items {
		var item map[string]json.RawMessage
		if err := common.Unmarshal(rawItem, &item); err != nil {
			continue
		}

		var itemType string
		if err := common.Unmarshal(item["type"], &itemType); err != nil || itemType != "message" {
			continue
		}

		rawID, exists := item["id"]
		if !exists {
			continue
		}

		var itemID string
		if err := common.Unmarshal(rawID, &itemID); err != nil || itemID == "" || strings.HasPrefix(itemID, "msg") {
			continue
		}

		delete(item, "id")
		cleanedItem, err := common.Marshal(item)
		if err != nil {
			return nil, 0, err
		}
		items[index] = cleanedItem
		cleanedCount++
	}

	if cleanedCount == 0 {
		return input, 0, nil
	}

	cleanedInput, err := common.Marshal(items)
	if err != nil {
		return nil, 0, err
	}
	return cleanedInput, cleanedCount, nil
}

// SanitizeResponsesRequestMessageIDs 在保留未知顶层字段的前提下清理完整 Responses 请求体。
func SanitizeResponsesRequestMessageIDs(body []byte) ([]byte, int, error) {
	var request map[string]json.RawMessage
	if err := common.Unmarshal(body, &request); err != nil {
		return nil, 0, err
	}

	input, exists := request["input"]
	if !exists {
		return body, 0, nil
	}

	cleanedInput, cleanedCount, err := SanitizeResponsesInputMessageIDs(input)
	if err != nil {
		return nil, 0, err
	}
	if cleanedCount == 0 {
		return body, 0, nil
	}

	request["input"] = cleanedInput
	cleanedBody, err := common.Marshal(request)
	if err != nil {
		return nil, 0, err
	}
	return cleanedBody, cleanedCount, nil
}
