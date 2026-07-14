package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminLogQueriesExcludeRootUsers(t *testing.T) {
	const rootUserId = 98001
	const regularUserId = 98002
	require.NoError(t, LOG_DB.AutoMigrate(&Log{}))
	require.NoError(t, DB.AutoMigrate(&Task{}, &Midjourney{}))

	require.NoError(t, LOG_DB.Exec("DELETE FROM logs WHERE user_id IN (?, ?)", rootUserId, regularUserId).Error)
	require.NoError(t, DB.Exec("DELETE FROM tasks WHERE user_id IN (?, ?)", rootUserId, regularUserId).Error)
	require.NoError(t, DB.Exec("DELETE FROM midjourneys WHERE user_id IN (?, ?)", rootUserId, regularUserId).Error)
	t.Cleanup(func() {
		require.NoError(t, LOG_DB.Where("user_id IN ?", []int{rootUserId, regularUserId}).Delete(&Log{}).Error)
		require.NoError(t, DB.Where("user_id IN ?", []int{rootUserId, regularUserId}).Delete(&Task{}).Error)
		require.NoError(t, DB.Where("user_id IN ?", []int{rootUserId, regularUserId}).Delete(&Midjourney{}).Error)
	})

	require.NoError(t, LOG_DB.Create(&[]Log{
		{UserId: rootUserId, Username: "root-log"},
		{UserId: regularUserId, Username: "user-log"},
	}).Error)
	logs, total, err := GetAllLogs(0, 0, 0, "", "", "", 0, 20, 0, "", "", "", []int{rootUserId})
	require.NoError(t, err)
	require.Len(t, logs, 1)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, regularUserId, logs[0].UserId)

	require.NoError(t, DB.Create(&[]Task{
		{UserId: rootUserId, TaskID: "root-task"},
		{UserId: regularUserId, TaskID: "user-task"},
	}).Error)
	taskParams := SyncTaskQueryParams{ExcludedUserIDs: []int{rootUserId}}
	tasks := TaskGetAllTasks(0, 20, taskParams)
	require.Len(t, tasks, 1)
	assert.Equal(t, regularUserId, tasks[0].UserId)
	assert.Equal(t, int64(1), TaskCountAllTasks(taskParams))

	require.NoError(t, DB.Create(&[]Midjourney{
		{UserId: rootUserId, MjId: "root-mj"},
		{UserId: regularUserId, MjId: "user-mj"},
	}).Error)
	mjParams := TaskQueryParams{ExcludedUserIDs: []int{rootUserId}}
	mjTasks := GetAllTasks(0, 20, mjParams)
	require.Len(t, mjTasks, 1)
	assert.Equal(t, regularUserId, mjTasks[0].UserId)
	assert.Equal(t, int64(1), CountAllTasks(mjParams))
}
