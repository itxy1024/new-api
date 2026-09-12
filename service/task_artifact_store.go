package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type StoredArtifactRef struct {
	Backend   string
	Bucket    string
	ObjectKey string
	PublicURL string
	MimeType  string
	Size      int64
}

type CreativeAssetUpload struct {
	GenerationID int64
	UserID       int
	MediaType    string
	AssetKey     string
	MimeType     string
	Width        int
	Height       int
	DurationMS   int64
}

type TaskArtifactStore interface {
	Enabled() bool
	Resolve(task *model.Task, artifactKey string) (*StoredArtifactRef, error)
	Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error)
	Serve(c *gin.Context, task *model.Task, ref *StoredArtifactRef) error
}

var ErrTaskArtifactStoreDisabled = errors.New("task artifact store is disabled")

type disabledArtifactStore struct{}

func (disabledArtifactStore) Enabled() bool {
	return false
}

func (disabledArtifactStore) Resolve(*model.Task, string) (*StoredArtifactRef, error) {
	return nil, nil
}

func (disabledArtifactStore) Persist(context.Context, *model.Task, types.TaskArtifact, io.Reader) (*StoredArtifactRef, error) {
	return nil, ErrTaskArtifactStoreDisabled
}

func (disabledArtifactStore) Serve(*gin.Context, *model.Task, *StoredArtifactRef) error {
	return ErrTaskArtifactStoreDisabled
}

type s3ArtifactStore struct {
	config   system_setting.TaskArtifactStoreConfig
	client   *s3.Client
	uploader *manager.Uploader
}

type countingHashReader struct {
	reader io.Reader
	hash   io.Writer
	size   int64
}

func (r *countingHashReader) Read(buffer []byte) (int, error) {
	count, err := r.reader.Read(buffer)
	if count > 0 {
		r.size += int64(count)
		_, _ = r.hash.Write(buffer[:count])
	}
	return count, err
}

var (
	artifactStoreMutex  sync.Mutex
	artifactStoreConfig system_setting.TaskArtifactStoreConfig
	taskArtifactStore   TaskArtifactStore = &disabledArtifactStore{}
)

func GetTaskArtifactStore() TaskArtifactStore {
	config := system_setting.LoadTaskArtifactStoreConfig()
	artifactStoreMutex.Lock()
	defer artifactStoreMutex.Unlock()
	if config == artifactStoreConfig {
		return taskArtifactStore
	}
	artifactStoreConfig = config
	store, err := newTaskArtifactStore(config)
	if err != nil {
		taskArtifactStore = &disabledArtifactStore{}
		return taskArtifactStore
	}
	taskArtifactStore = store
	return taskArtifactStore
}

func ReloadTaskArtifactStore() {
	artifactStoreMutex.Lock()
	artifactStoreConfig = system_setting.TaskArtifactStoreConfig{}
	taskArtifactStore = &disabledArtifactStore{}
	artifactStoreMutex.Unlock()
}

func TestTaskArtifactStore(ctx context.Context, config system_setting.TaskArtifactStoreConfig) error {
	store, err := newTaskArtifactStore(config)
	if err != nil {
		return err
	}
	s3Store, ok := store.(*s3ArtifactStore)
	if !ok {
		return ErrTaskArtifactStoreDisabled
	}
	_, err = s3Store.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(config.S3Bucket)})
	return err
}

func newTaskArtifactStore(config system_setting.TaskArtifactStoreConfig) (TaskArtifactStore, error) {
	if config.Mode != system_setting.TaskArtifactStoreModeS3 {
		return &disabledArtifactStore{}, nil
	}
	if err := system_setting.ValidateTaskArtifactStoreConfig(config); err != nil {
		return nil, err
	}
	awsConfig := aws.Config{
		Region:      config.S3Region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(config.S3AccessKey, config.S3SecretKey, "")),
		HTTPClient:  http.DefaultClient,
	}
	client := s3.NewFromConfig(awsConfig, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(config.S3Endpoint)
		options.UsePathStyle = config.S3PathStyle
	})
	return &s3ArtifactStore{
		config:   config,
		client:   client,
		uploader: manager.NewUploader(client),
	}, nil
}

func (s *s3ArtifactStore) Enabled() bool {
	return true
}

func (s *s3ArtifactStore) Resolve(task *model.Task, artifactKey string) (*StoredArtifactRef, error) {
	if task == nil {
		return nil, nil
	}
	asset, exists, err := model.GetCreativeAssetForTask(context.Background(), task.UserId, task.TaskID, artifactKey)
	if err != nil || !exists {
		return nil, err
	}
	return storedArtifactRef(asset), nil
}

func (s *s3ArtifactStore) Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error) {
	if task == nil {
		return nil, errors.New("task is required")
	}
	clientTaskID := "video:" + task.TaskID
	generation, exists, err := model.GetCreativeGenerationByClientTaskID(ctx, task.UserId, clientTaskID)
	if err != nil {
		return nil, err
	}
	if !exists {
		createdAt := task.CreatedAt
		if createdAt == 0 {
			createdAt = task.SubmitTime
		}
		generation = &model.CreativeGeneration{
			ClientTaskID:   clientTaskID,
			ProviderTaskID: task.TaskID,
			UserID:         task.UserId,
			TokenID:        task.PrivateData.TokenId,
			MediaType:      model.CreativeMediaTypeVideo,
			Model:          task.Properties.OriginModelName,
			Group:          task.Group,
			Prompt:         task.Properties.Input,
			Status:         model.CreativeGenerationStatusProcessing,
			CreatedAt:      time.Unix(createdAt, 0).Local(),
		}
		if generation.Model == "" {
			generation.Model = task.Properties.UpstreamModelName
		}
		if err := model.InsertCreativeGeneration(ctx, generation); err != nil {
			generation, exists, err = model.GetCreativeGenerationByClientTaskID(ctx, task.UserId, clientTaskID)
			if err != nil || !exists {
				return nil, err
			}
		}
	}
	if existing, found, lookupErr := model.GetCreativeAssetByGenerationKey(ctx, task.UserId, generation.ID, artifact.Key); lookupErr != nil {
		return nil, lookupErr
	} else if found {
		return storedArtifactRef(existing), nil
	}
	ref, err := s.persistCreativeAsset(ctx, CreativeAssetUpload{
		GenerationID: generation.ID,
		UserID:       task.UserId,
		MediaType:    model.CreativeMediaTypeVideo,
		AssetKey:     artifact.Key,
		MimeType:     artifact.MimeType,
	}, content)
	if err != nil {
		finishedAt := time.Now()
		_ = model.UpdateCreativeGenerationResult(ctx, generation.ID, model.CreativeGenerationStatusFailed, 0, &finishedAt, err.Error())
		return nil, err
	}
	elapsedMS := int64(0)
	if task.FinishTime > task.SubmitTime {
		elapsedMS = (task.FinishTime - task.SubmitTime) * 1000
	}
	var finishedAt *time.Time
	if task.FinishTime > 0 {
		value := time.Unix(task.FinishTime, 0).Local()
		finishedAt = &value
	}
	_ = model.UpdateCreativeGenerationResult(ctx, generation.ID, model.CreativeGenerationStatusCompleted, elapsedMS, finishedAt, "")
	return ref, nil
}

func (s *s3ArtifactStore) Serve(c *gin.Context, _ *model.Task, ref *StoredArtifactRef) error {
	if ref == nil || ref.ObjectKey == "" {
		return errors.New("stored artifact is required")
	}
	publicURL := strings.TrimSpace(ref.PublicURL)
	if publicURL == "" {
		var err error
		publicURL, err = creativeAssetPublicURL(s.config, ref.Bucket, ref.ObjectKey)
		if err != nil {
			return err
		}
	}
	c.Header("Cache-Control", "private, max-age=3600")
	c.Redirect(http.StatusTemporaryRedirect, publicURL)
	return nil
}

func PersistCreativeAsset(ctx context.Context, upload CreativeAssetUpload, content io.Reader) (*model.CreativeAsset, error) {
	store, ok := GetTaskArtifactStore().(*s3ArtifactStore)
	if !ok {
		return nil, ErrTaskArtifactStoreDisabled
	}
	if existing, found, err := model.GetCreativeAssetByGenerationKey(ctx, upload.UserID, upload.GenerationID, upload.AssetKey); err != nil {
		return nil, err
	} else if found {
		return existing, nil
	}
	ref, err := store.persistCreativeAsset(ctx, upload, content)
	if err != nil {
		return nil, err
	}
	asset, found, err := model.GetCreativeAssetByGenerationKey(ctx, upload.UserID, upload.GenerationID, upload.AssetKey)
	if err != nil {
		return nil, err
	}
	if !found || asset == nil {
		return nil, fmt.Errorf("creative asset %s was not persisted", ref.ObjectKey)
	}
	return asset, nil
}

func ServeCreativeAsset(c *gin.Context, asset *model.CreativeAsset) error {
	publicURL, err := EnsureCreativeAssetPublicURL(c.Request.Context(), asset)
	if err != nil {
		return err
	}
	c.Header("Cache-Control", "private, max-age=3600")
	c.Redirect(http.StatusTemporaryRedirect, publicURL)
	return nil
}

func EnsureCreativeAssetPublicURL(ctx context.Context, asset *model.CreativeAsset) (string, error) {
	if asset == nil {
		return "", errors.New("creative asset is required")
	}
	if publicURL := strings.TrimSpace(asset.PublicURL); publicURL != "" {
		return publicURL, nil
	}
	store, err := existingS3ArtifactStore()
	if err != nil {
		return "", err
	}
	publicURL, err := creativeAssetPublicURL(store.config, asset.Bucket, asset.ObjectKey)
	if err != nil {
		return "", err
	}
	if err := model.SetCreativeAssetPublicURL(ctx, asset.ID, publicURL); err != nil {
		return "", err
	}
	asset.PublicURL = publicURL
	return publicURL, nil
}

func DeleteCreativeAssets(ctx context.Context, assets []model.CreativeAsset) error {
	store, err := existingS3ArtifactStore()
	if err != nil {
		return err
	}
	for index := range assets {
		if assets[index].ObjectKey == "" {
			continue
		}
		if _, err := store.client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(assets[index].Bucket),
			Key:    aws.String(assets[index].ObjectKey),
		}); err != nil {
			return err
		}
	}
	return nil
}

func existingS3ArtifactStore() (*s3ArtifactStore, error) {
	if store, ok := GetTaskArtifactStore().(*s3ArtifactStore); ok {
		return store, nil
	}
	config := system_setting.LoadTaskArtifactStoreConfig()
	config.Mode = system_setting.TaskArtifactStoreModeS3
	store, err := newTaskArtifactStore(config)
	if err != nil {
		return nil, err
	}
	s3Store, ok := store.(*s3ArtifactStore)
	if !ok {
		return nil, ErrTaskArtifactStoreDisabled
	}
	return s3Store, nil
}

func (s *s3ArtifactStore) persistCreativeAsset(ctx context.Context, upload CreativeAssetUpload, content io.Reader) (*StoredArtifactRef, error) {
	if upload.GenerationID <= 0 || upload.UserID <= 0 || content == nil {
		return nil, errors.New("creative asset metadata is incomplete")
	}
	mimeType := strings.TrimSpace(upload.MimeType)
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	extension := creativeAssetExtension(mimeType)
	datePath := time.Now().UTC().Format("2006/01/02")
	objectKey := path.Join(
		strings.Trim(s.config.S3Prefix, "/"),
		"creative",
		strconv.Itoa(upload.UserID),
		upload.MediaType,
		datePath,
		strconv.FormatInt(upload.GenerationID, 10),
		upload.AssetKey+"-"+uuid.NewString()+extension,
	)
	publicURL, err := creativeAssetPublicURL(s.config, s.config.S3Bucket, objectKey)
	if err != nil {
		return nil, err
	}
	hasher := sha256.New()
	reader := &countingHashReader{reader: content, hash: hasher}
	_, err = s.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.config.S3Bucket),
		Key:         aws.String(objectKey),
		Body:        reader,
		ContentType: aws.String(mimeType),
	})
	if err != nil {
		return nil, err
	}
	asset := &model.CreativeAsset{
		GenerationID:   upload.GenerationID,
		UserID:         upload.UserID,
		AssetKey:       upload.AssetKey,
		StorageBackend: system_setting.TaskArtifactStoreModeS3,
		Bucket:         s.config.S3Bucket,
		ObjectKey:      objectKey,
		PublicURL:      publicURL,
		MimeType:       mimeType,
		ByteSize:       reader.size,
		Width:          upload.Width,
		Height:         upload.Height,
		DurationMS:     upload.DurationMS,
		Checksum:       hex.EncodeToString(hasher.Sum(nil)),
		CreatedAt:      time.Now(),
	}
	if err := model.InsertCreativeAssetForActiveGeneration(ctx, asset); err != nil {
		_, _ = s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(s.config.S3Bucket),
			Key:    aws.String(objectKey),
		})
		return nil, err
	}
	return storedArtifactRef(asset), nil
}

func storedArtifactRef(asset *model.CreativeAsset) *StoredArtifactRef {
	if asset == nil {
		return nil
	}
	return &StoredArtifactRef{
		Backend:   asset.StorageBackend,
		Bucket:    asset.Bucket,
		ObjectKey: asset.ObjectKey,
		PublicURL: asset.PublicURL,
		MimeType:  asset.MimeType,
		Size:      asset.ByteSize,
	}
}

func creativeAssetPublicURL(config system_setting.TaskArtifactStoreConfig, bucket, objectKey string) (string, error) {
	endpoint, err := url.Parse(strings.TrimSpace(config.S3Endpoint))
	if err != nil || endpoint == nil || endpoint.Host == "" {
		return "", errors.New("S3 endpoint is invalid")
	}
	bucket = strings.TrimSpace(bucket)
	objectKey = strings.TrimLeft(strings.TrimSpace(objectKey), "/")
	if bucket == "" || objectKey == "" {
		return "", errors.New("creative asset storage location is incomplete")
	}
	if config.S3PathStyle {
		endpoint.Path = path.Join(endpoint.Path, bucket, objectKey)
	} else {
		endpoint.Host = bucket + "." + endpoint.Host
		endpoint.Path = path.Join(endpoint.Path, objectKey)
	}
	return endpoint.String(), nil
}

func creativeAssetExtension(mimeType string) string {
	switch strings.ToLower(strings.TrimSpace(strings.SplitN(mimeType, ";", 2)[0])) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	}
	extensions, _ := mime.ExtensionsByType(mimeType)
	if len(extensions) > 0 && len(extensions[0]) <= 10 {
		return extensions[0]
	}
	return ".bin"
}
