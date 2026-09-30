#include "MoonshineVehicleBase.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "MoonshineWheels.h"
#include "ShineTuning.h"

AMoonshineVehicleBase::AMoonshineVehicleBase()
{
	PrimaryActorTick.bCanEverTick = true;

	GetMesh()->SetSimulatePhysics(true);
	GetMesh()->SetCollisionProfileName(TEXT("Vehicle"));

	// Four wheels on the bone names used by UE's Vehicle template meshes.
	UChaosWheeledVehicleMovementComponent* Move = GetWheeledMovement();
	static const TCHAR* Bones[] = { TEXT("Phys_Wheel_FL"), TEXT("Phys_Wheel_FR"), TEXT("Phys_Wheel_BL"), TEXT("Phys_Wheel_BR") };
	Move->WheelSetups.SetNum(4);
	for (int32 i = 0; i < 4; ++i)
	{
		Move->WheelSetups[i].WheelClass = i < 2 ? UMoonshineWheelFront::StaticClass() : UMoonshineWheelRear::StaticClass();
		Move->WheelSetups[i].BoneName = FName(Bones[i]);
	}

	// A heavy 1920s truck: rear-wheel drive, plenty of low-end pull, automatic gears.
	Move->EngineSetup.MaxTorque = 700.f;
	Move->EngineSetup.MaxRPM = 5000.f;
	Move->TransmissionSetup.bUseAutomaticGears = true;
	Move->TransmissionSetup.bUseAutoReverse = true;
	Move->DifferentialSetup.DifferentialType = EVehicleDifferential::RearWheelDrive;
}

UChaosWheeledVehicleMovementComponent* AMoonshineVehicleBase::GetWheeledMovement() const
{
	return CastChecked<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent());
}

void AMoonshineVehicleBase::SetDriveInput(float Throttle, float Brake, float Steer, bool bHandbrake)
{
	UChaosVehicleMovementComponent* Move = GetVehicleMovementComponent();
	Move->SetThrottleInput(FMath::Clamp(Throttle, 0.f, 1.f));
	Move->SetBrakeInput(FMath::Clamp(Brake, 0.f, 1.f));
	Move->SetSteeringInput(FMath::Clamp(Steer, -1.f, 1.f));
	Move->SetHandbrakeInput(bHandbrake);
}

float AMoonshineVehicleBase::GetForwardSpeed() const
{
	return GetVehicleMovementComponent()->GetForwardSpeed();
}

float AMoonshineVehicleBase::GetSpeedMph() const
{
	return FMath::Abs(GetForwardSpeed()) * ShineTuning::CmPerSecToMph;
}

void AMoonshineVehicleBase::ResetTo(const FTransform& Where)
{
	FRotator Upright = Where.Rotator();
	Upright.Pitch = 0.f;
	Upright.Roll = 0.f;
	SetActorTransform(FTransform(Upright, Where.GetLocation() + FVector(0.f, 0.f, 50.f)), false, nullptr, ETeleportType::TeleportPhysics);
	GetMesh()->SetPhysicsLinearVelocity(FVector::ZeroVector);
	GetMesh()->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
	SetDriveInput(0.f, 0.f, 0.f);
}
