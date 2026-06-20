// ProhibitionCop.cpp — Dev Guide Phase 3
// SKELETON: simple state machine standing in for the Behavior Tree wiring. The
// chase logic mirrors src/cops.js in the web demo (steer toward the player).
#include "ProhibitionCop.h"
#include "Kismet/GameplayStatics.h"

AProhibitionCop::AProhibitionCop()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AProhibitionCop::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	static float TimeLostSight = 0.f;
	const bool bSees = CanSeePlayer();

	switch (State)
	{
	case EPursuerState::Patrol:
		// TODO: follow patrol spline / random road points.
		if (bSees) State = EPursuerState::Chase;
		break;

	case EPursuerState::Chase:
		if (APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0))
		{
			DriveToward(Player->GetActorLocation(), DeltaSeconds);
		}
		if (!bSees)
		{
			TimeLostSight = 0.f;
			State = EPursuerState::Searching;
		}
		break;

	case EPursuerState::Searching:
		TimeLostSight += DeltaSeconds;
		if (bSees) State = EPursuerState::Chase;
		else if (TimeLostSight >= GiveUpTime) State = EPursuerState::Patrol;
		break;
	}
}

bool AProhibitionCop::CanSeePlayer() const
{
	const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Player) return false;
	return FVector::Dist(GetActorLocation(), Player->GetActorLocation()) <= DetectionRange;
	// TODO: add a line-of-sight trace so buildings actually break pursuit.
}

void AProhibitionCop::DriveToward(const FVector& Target, float DeltaSeconds)
{
	const FVector ToTarget = (Target - GetActorLocation()).GetSafeNormal();
	const float Forward = FVector::DotProduct(GetActorForwardVector(), ToTarget);
	const float Side = FVector::DotProduct(GetActorRightVector(), ToTarget);

	Throttle(Forward > 0.f ? 1.f : 0.3f);
	Steer(FMath::Clamp(Side * 2.f, -1.f, 1.f));
}
