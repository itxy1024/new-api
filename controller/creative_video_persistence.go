package controller

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaychannel "github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"golang.org/x/sync/singleflight"
)

var creativeVideoPersistGroup singleflight.Group

func scheduleCreativeVideoPersistence(userID int, taskID string) {
	if !service.GetTaskArtifactStore().Enabled() || userID <= 0 || strings.TrimSpace(taskID) == "" {
		return
	}
	go func() {
		_, err, _ := creativeVideoPersistGroup.Do(fmt.Sprintf("%d:%s", userID, taskID), func() (any, error) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
			defer cancel()
			task, exists, err := model.GetByTaskId(userID, taskID)
			if err != nil || !exists || task == nil || task.Status != model.TaskStatusSuccess {
				return nil, err
			}
			return nil, persistCreativeVideoTask(ctx, task)
		})
		if err != nil {
			logger.LogError(context.Background(), "创作中心视频 OSS 持久化失败: "+err.Error())
		}
	}()
}

func persistCreativeVideoTask(ctx context.Context, task *model.Task) error {
	artifacts := []relaychannel.TaskArtifact{}
	if taskHasPluginExecution(task) {
		projected, err := projectTaskArtifacts(task)
		if err != nil {
			return err
		}
		for index := range projected {
			if projected[index].Type == "video" {
				artifacts = append(artifacts, projected[index])
			}
		}
	} else if legacyVideoAvailable(task) {
		artifacts = append(artifacts, relaychannel.TaskArtifact{Key: "video", Type: "video", MimeType: "video/mp4"})
	}
	for index := range artifacts {
		store := service.GetTaskArtifactStore()
		if existing, err := store.Resolve(task, artifacts[index].Key); err != nil {
			return err
		} else if existing != nil {
			continue
		}
		descriptor, err := creativeVideoContentRequest(task, artifacts[index])
		if err != nil {
			return err
		}
		content, mimeType, closeContent, err := openCreativeVideoContent(ctx, task, descriptor)
		if err != nil {
			return err
		}
		if artifacts[index].MimeType == "" {
			artifacts[index].MimeType = mimeType
		}
		_, persistErr := store.Persist(ctx, task, types.TaskArtifact(artifacts[index]), content)
		closeErr := closeContent()
		if persistErr != nil {
			return persistErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func creativeVideoContentRequest(task *model.Task, artifact relaychannel.TaskArtifact) (*relaychannel.TaskContentRequest, error) {
	if !taskHasPluginExecution(task) {
		return &relaychannel.TaskContentRequest{
			URL:            task.GetResultURL(),
			Method:         http.MethodGet,
			Credentialless: true,
		}, nil
	}
	adaptor, err := initTaskArtifactAdaptor(task)
	if err != nil {
		return nil, err
	}
	provider, ok := adaptor.(relaychannel.TaskContentRequestProvider)
	if !ok {
		return nil, errTaskArtifactPluginUnavailable
	}
	return provider.BuildContentRequest(task, artifact.Key, relaychannel.TaskArtifactClientRequest{Method: http.MethodGet})
}

func openCreativeVideoContent(ctx context.Context, task *model.Task, descriptor *relaychannel.TaskContentRequest) (io.Reader, string, func() error, error) {
	if descriptor == nil {
		return nil, "", nil, errors.New("视频结果没有下载描述")
	}
	rawURL := strings.TrimSpace(descriptor.URL)
	if strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		if len(rawURL) > taskMediaDataURLMaxEncodedBytes {
			return nil, "", nil, errors.New("视频 data URL 超过大小限制")
		}
		header, payload, found := strings.Cut(rawURL, ",")
		if !found || !strings.Contains(strings.ToLower(header), ";base64") {
			return nil, "", nil, errors.New("视频 data URL 格式无效")
		}
		content, err := base64.StdEncoding.DecodeString(payload)
		if err != nil {
			content, err = base64.RawStdEncoding.DecodeString(payload)
		}
		if err != nil {
			return nil, "", nil, err
		}
		mimeType := strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64")
		if mimeType == "" {
			mimeType = "video/mp4"
		}
		return bytes.NewReader(content), mimeType, func() error { return nil }, nil
	}
	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL == nil || parsedURL.Host == "" || parsedURL.User != nil || parsedURL.Fragment != "" ||
		(parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return nil, "", nil, errTaskMediaRequestRejected
	}
	method := strings.ToUpper(strings.TrimSpace(descriptor.Method))
	if method == "" {
		method = http.MethodGet
	}
	if method != http.MethodGet && method != http.MethodPost {
		return nil, "", nil, errTaskMediaRequestRejected
	}
	if len(descriptor.Body) > 1<<20 {
		return nil, "", nil, errTaskMediaRequestRejected
	}
	channel, err := model.CacheGetChannel(task.ChannelId)
	if err != nil {
		return nil, "", nil, err
	}
	proxy := strings.TrimSpace(channel.GetSetting().Proxy)
	if err := validateTaskMediaURL(rawURL, proxy); err != nil {
		return nil, "", nil, err
	}
	client := service.GetSSRFProtectedHTTPClient()
	if proxy != "" {
		client, err = service.GetHttpClientWithProxy(proxy)
		if err != nil {
			return nil, "", nil, err
		}
	}
	if client == nil {
		client = http.DefaultClient
	}
	request, err := http.NewRequestWithContext(ctx, method, parsedURL.String(), bytes.NewReader(descriptor.Body))
	if err != nil {
		return nil, "", nil, err
	}
	if err := applyTaskMediaRequestHeaders(request.Header, descriptor.Headers); err != nil {
		return nil, "", nil, err
	}
	redirectClient := *client
	redirectClient.Timeout = 0
	redirectClient.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= 10 || request.URL == nil {
			return errTaskMediaRequestRejected
		}
		if err := validateTaskMediaURL(request.URL.String(), proxy); err != nil {
			return err
		}
		if len(via) > 0 && !sameTaskMediaOrigin(via[len(via)-1].URL, request.URL) && !descriptor.Credentialless {
			return errTaskMediaRequestRejected
		}
		return nil
	}
	response, err := doTaskMediaRequest(&redirectClient, request, taskMediaResponseHeaderTimeout)
	if err != nil {
		return nil, "", nil, errors.New("下载视频结果失败")
	}
	if response.StatusCode != http.StatusOK {
		_ = response.Body.Close()
		return nil, "", nil, fmt.Errorf("视频地址返回状态 %d", response.StatusCode)
	}
	mimeType := strings.TrimSpace(strings.SplitN(response.Header.Get("Content-Type"), ";", 2)[0])
	if mimeType == "" {
		mimeType = "video/mp4"
	}
	return response.Body, mimeType, response.Body.Close, nil
}
