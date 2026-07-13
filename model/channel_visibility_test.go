package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetChannelVisibilityTestTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Channel{}, &Ability{}))
	require.NoError(t, DB.Exec("DELETE FROM abilities").Error)
	require.NoError(t, DB.Exec("DELETE FROM channels").Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Exec("DELETE FROM abilities").Error)
		require.NoError(t, DB.Exec("DELETE FROM channels").Error)
		InitChannelCache()
	})
}

func TestApplyChannelAdminScope(t *testing.T) {
	resetChannelVisibilityTestTables(t)
	require.NoError(t, DB.Create(&[]Channel{
		{Id: 1, Name: "routing", Key: "key-1"},
		{Id: 2, Name: "admin-visible", Key: "key-2", AdminVisible: true},
	}).Error)

	var adminChannels []Channel
	require.NoError(t, ApplyChannelAdminScope(DB.Model(&Channel{}), common.RoleAdminUser).Find(&adminChannels).Error)
	require.Len(t, adminChannels, 1)
	assert.Equal(t, 2, adminChannels[0].Id)

	var rootChannels []Channel
	require.NoError(t, ApplyChannelAdminScope(DB.Model(&Channel{}), common.RoleRootUser).Order("id").Find(&rootChannels).Error)
	require.Len(t, rootChannels, 2)
	assert.Equal(t, []int{1, 2}, []int{rootChannels[0].Id, rootChannels[1].Id})
}

func TestAdminVisibleChannelNeverParticipatesInRouting(t *testing.T) {
	resetChannelVisibilityTestTables(t)
	require.NoError(t, DB.Create(&[]Channel{
		{Id: 11, Name: "routing", Key: "key-11", Status: common.ChannelStatusEnabled, Models: "test-model", Group: "default"},
		{Id: 12, Name: "admin-visible", Key: "key-12", Status: common.ChannelStatusEnabled, Models: "test-model", Group: "default", AdminVisible: true},
	}).Error)
	priority := int64(0)
	require.NoError(t, DB.Create(&[]Ability{
		{Group: "default", Model: "test-model", ChannelId: 11, Enabled: true, Priority: &priority},
		{Group: "default", Model: "test-model", ChannelId: 12, Enabled: true, Priority: &priority, Weight: 1000},
	}).Error)

	for _, memoryCacheEnabled := range []bool{false, true} {
		t.Run(map[bool]string{false: "database", true: "memory-cache"}[memoryCacheEnabled], func(t *testing.T) {
			original := common.MemoryCacheEnabled
			common.MemoryCacheEnabled = memoryCacheEnabled
			t.Cleanup(func() { common.MemoryCacheEnabled = original })
			InitChannelCache()

			channel, err := GetRandomSatisfiedChannel("default", "test-model", 0, "")
			require.NoError(t, err)
			require.NotNil(t, channel)
			assert.Equal(t, 11, channel.Id)
		})
	}
}
