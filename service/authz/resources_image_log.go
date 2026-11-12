package authz

const ResourceImageLog = "image_log"

var ImageLogRead = Permission{Resource: ResourceImageLog, Action: ActionRead}

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceImageLog,
		LabelKey: "Image Generation Logs",
		Actions: []ActionDefinition{{
			Action:         ActionRead,
			LabelKey:       "View image generation logs",
			DescriptionKey: "View image generation records and images. Admins cannot view root records.",
		}},
	})
}
