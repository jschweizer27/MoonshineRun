#include "MoonshineWheels.h"

UMoonshineWheelFront::UMoonshineWheelFront()
{
	AxleType = EAxleType::Front;
	bAffectedBySteering = true;
	MaxSteerAngle = 38.f;
}

UMoonshineWheelRear::UMoonshineWheelRear()
{
	AxleType = EAxleType::Rear;
	bAffectedByEngine = true;
	bAffectedByHandbrake = true;
}
