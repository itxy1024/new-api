package authz

const (
	ResourceLog = "log"

	ActionChannelView = "channel_view"
)

var LogChannelView = Permission{Resource: ResourceLog, Action: ActionChannelView}

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceLog,
		LabelKey: "Log Management",
		Actions: []ActionDefinition{
			{
				Action:         ActionChannelView,
				LabelKey:       "View log channels",
				DescriptionKey: "View channel IDs, channel names, retry chains, and channel filters in usage logs.",
			},
		},
	})
}
