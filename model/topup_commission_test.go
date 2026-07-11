package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTopUpCommissionTest(t *testing.T) {
	t.Helper()
	truncateTables(t)

	originalRatio := common.TopUpCommissionRatio
	originalQuotaPerUnit := common.QuotaPerUnit
	paymentSetting := operation_setting.GetPaymentSetting()
	originalComplianceConfirmed := paymentSetting.ComplianceConfirmed
	originalComplianceTermsVersion := paymentSetting.ComplianceTermsVersion
	common.TopUpCommissionRatio = 10
	common.QuotaPerUnit = 1
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	t.Cleanup(func() {
		common.TopUpCommissionRatio = originalRatio
		common.QuotaPerUnit = originalQuotaPerUnit
		paymentSetting.ComplianceConfirmed = originalComplianceConfirmed
		paymentSetting.ComplianceTermsVersion = originalComplianceTermsVersion
	})

	require.NoError(t, DB.Create(&User{
		Id:              701,
		Username:        "commission_inviter",
		AffCode:         "commission-inviter",
		Status:          common.UserStatusEnabled,
		AffQuota:        3,
		AffHistoryQuota: 4,
	}).Error)
	require.NoError(t, DB.Create(&User{
		Id:        702,
		Username:  "commission_invitee",
		AffCode:   "commission-invitee",
		Status:    common.UserStatusEnabled,
		InviterId: 701,
	}).Error)
}

func insertTopUpCommissionOrder(t *testing.T, tradeNo string) {
	t.Helper()
	require.NoError(t, (&TopUp{
		UserId:          702,
		Amount:          100,
		Money:           90,
		TradeNo:         tradeNo,
		PaymentMethod:   "wxpay",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}).Insert())
}

func getTopUpCommissionUsers(t *testing.T) (User, User) {
	t.Helper()
	var inviter User
	var invitee User
	require.NoError(t, DB.First(&inviter, 701).Error)
	require.NoError(t, DB.First(&invitee, 702).Error)
	return inviter, invitee
}

func TestRechargeEpayAwardsInviterByCreditedQuotaOnce(t *testing.T) {
	setupTopUpCommissionTest(t)
	insertTopUpCommissionOrder(t, "commission-epay")

	require.NoError(t, RechargeEpay("commission-epay", "alipay", "127.0.0.1"))

	inviter, invitee := getTopUpCommissionUsers(t)
	assert.Equal(t, 100, invitee.Quota)
	assert.Equal(t, 13, inviter.AffQuota)
	assert.Equal(t, 14, inviter.AffHistoryQuota)
	var commissionLog Log
	require.NoError(t, DB.Where("user_id = ? AND content LIKE ?", inviter.Id, "受邀用户在线充值返利%").First(&commissionLog).Error)
	assert.Contains(t, commissionLog.Content, "（返利比例 10%）")

	require.NoError(t, RechargeEpay("commission-epay", "alipay", "127.0.0.1"))
	inviter, invitee = getTopUpCommissionUsers(t)
	assert.Equal(t, 100, invitee.Quota)
	assert.Equal(t, 13, inviter.AffQuota)
	assert.Equal(t, 14, inviter.AffHistoryQuota)
}

func TestOnlineTopUpProvidersAwardCommission(t *testing.T) {
	testCases := []struct {
		name     string
		provider string
		recharge func(tradeNo string) error
	}{
		{
			name:     "stripe",
			provider: PaymentProviderStripe,
			recharge: func(tradeNo string) error {
				return Recharge(tradeNo, "cus_test", "127.0.0.1")
			},
		},
		{
			name:     "creem",
			provider: PaymentProviderCreem,
			recharge: func(tradeNo string) error {
				return RechargeCreem(tradeNo, "", "", "127.0.0.1")
			},
		},
		{
			name:     "waffo",
			provider: PaymentProviderWaffo,
			recharge: func(tradeNo string) error {
				return RechargeWaffo(tradeNo, "127.0.0.1")
			},
		},
		{
			name:     "waffo pancake",
			provider: PaymentProviderWaffoPancake,
			recharge: RechargeWaffoPancake,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			setupTopUpCommissionTest(t)
			tradeNo := "commission-" + testCase.provider
			require.NoError(t, (&TopUp{
				UserId:          702,
				Amount:          100,
				Money:           100,
				TradeNo:         tradeNo,
				PaymentMethod:   testCase.provider,
				PaymentProvider: testCase.provider,
				Status:          common.TopUpStatusPending,
				CreateTime:      time.Now().Unix(),
			}).Insert())

			require.NoError(t, testCase.recharge(tradeNo))

			inviter, invitee := getTopUpCommissionUsers(t)
			assert.Equal(t, 100, invitee.Quota)
			assert.Equal(t, 13, inviter.AffQuota)
			assert.Equal(t, 14, inviter.AffHistoryQuota)
		})
	}
}

func TestManualCompleteTopUpDoesNotAwardCommission(t *testing.T) {
	setupTopUpCommissionTest(t)
	insertTopUpCommissionOrder(t, "commission-manual")

	require.NoError(t, ManualCompleteTopUp("commission-manual", "127.0.0.1"))

	inviter, invitee := getTopUpCommissionUsers(t)
	assert.Equal(t, 100, invitee.Quota)
	assert.Equal(t, 3, inviter.AffQuota)
	assert.Equal(t, 4, inviter.AffHistoryQuota)
}

func TestTopUpCommissionRequiresPaymentCompliance(t *testing.T) {
	setupTopUpCommissionTest(t)
	operation_setting.GetPaymentSetting().ComplianceConfirmed = false
	insertTopUpCommissionOrder(t, "commission-without-compliance")

	require.NoError(t, RechargeEpay("commission-without-compliance", "alipay", "127.0.0.1"))

	inviter, invitee := getTopUpCommissionUsers(t)
	assert.Equal(t, 100, invitee.Quota)
	assert.Equal(t, 3, inviter.AffQuota)
	assert.Equal(t, 4, inviter.AffHistoryQuota)
}
