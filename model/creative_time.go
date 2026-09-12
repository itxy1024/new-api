package model

import "time"

// CreativeTimeLocation 是创作记录统一使用的中国标准时间。
var CreativeTimeLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

func CreativeNow() time.Time {
	return time.Now().In(CreativeTimeLocation)
}

func CreativeTimeFromUnix(seconds int64) time.Time {
	return time.Unix(seconds, 0).In(CreativeTimeLocation)
}
