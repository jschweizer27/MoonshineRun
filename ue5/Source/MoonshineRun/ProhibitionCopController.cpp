#include "ProhibitionCopController.h"
#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "MoonshineDeliveryManager.h"
#include "NavigationPath.h"
#include "NavigationSystem.h"
#include "ProhibitionCop.h"

const FName AProhibitionCopController::TargetKey(TEXT("TargetActor"));
const FName AProhibitionCopController::CanSeeKey(TEXT("CanSeeTarget"));
const FName AProhibitionCopController::LastKnownKey(TEXT("LastKnownLocation"));
const FName AProhibitionCopController::ModeKey(TEXT("Mode"));
const FName AProhibitionCopController::DriveGoalKey(TEXT("DriveGoal"));

namespace
{
	constexpr float ArriveRadius = 1400.f;     // "reached" a goal point
	constexpr float PatrolRadius = 35000.f;    // patrols cruise the roads around Otto
	constexpr float SearchRadius = 9000.f;     // searches comb the streets around the sighting
	constexpr float CloseChase = 2000.f;       // this close, cops keep coming even without sight
}

AProhibitionCopController::AProhibitionCopController()
{
	PrimaryActorTick.bCanEverTick = true;
}

AProhibitionCop* AProhibitionCopController::GetCop() const
{
	return Cast<AProhibitionCop>(GetPawn());
}

void AProhibitionCopController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	LastKnownLocation = InPawn->GetActorLocation();
	const AProhibitionCop* Cop = GetCop();
	bUsingBehaviorTree = Cop && Cop->BehaviorTree && RunBehaviorTree(Cop->BehaviorTree);
}

void AProhibitionCopController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bUsingBehaviorTree && GetCop())
	{
		UpdatePursuit(DeltaSeconds);
		DriveToward(GetDriveGoal(), GetDesiredSpeed(), DeltaSeconds);
	}
}

FShineHeatContext AProhibitionCopController::GetHeatContext()
{
	if (!Manager.IsValid())
	{
		Manager = AMoonshineDeliveryManager::Find(this);
	}
	return Manager.IsValid() ? Manager->GetHeatContext() : FShineHeatContext();
}

void AProhibitionCopController::SetMode(EPursuerMode NewMode)
{
	if (Mode == NewMode)
	{
		return;
	}
	Mode = NewMode;
	ModeTime = 0.f;
	bHasWanderGoal = false;
	if (AProhibitionCop* Cop = GetCop())
	{
		Cop->OnModeChanged(NewMode);
	}
}

void AProhibitionCopController::StartChase(const FVector& PlayerLocation)
{
	LastKnownLocation = PlayerLocation;
	TimeOutOfSight = 0.f;
	SetMode(EPursuerMode::Chase);
}

void AProhibitionCopController::StartLeaving(const FVector& PlayerLocation)
{
	SetMode(EPursuerMode::Leave);
	const APawn* Cop = GetPawn();
	const FVector Away = Cop ? (Cop->GetActorLocation() - PlayerLocation).GetSafeNormal2D() : FVector::ForwardVector;
	LeaveGoal = PickRoadPoint(PlayerLocation + Away * 30000.f, 5000.f);
}

bool AProhibitionCopController::ConsumeSpotted()
{
	const bool bWasSpotted = bSpotted;
	bSpotted = false;
	return bWasSpotted;
}

void AProhibitionCopController::UpdatePursuit(float DeltaSeconds)
{
	ModeTime += DeltaSeconds;
	const AProhibitionCop* Cop = GetCop();
	const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Cop || !Player)
	{
		bSeesPlayer = false;
		return;
	}
	const FShineHeatContext Ctx = GetHeatContext();
	const FVector P = Player->GetActorLocation();
	const float Dist = FVector::Dist2D(Cop->GetActorLocation(), P);

	bSeesPlayer = Dist < Cop->SightRange && !Ctx.bSafeZone && Mode != EPursuerMode::Leave && HasLineOfSight(Player);

	if (Mode == EPursuerMode::Patrol)
	{
		// Patrols only react to a truck that looks wrong: hauling, and either speeding (no
		// disguise) or close enough to see the jugs. Once Otto is wanted, any patrol that
		// sees him joins in.
		const bool bSuspicious = Ctx.bCarrying && (!Ctx.bDisguised || Dist < Cop->CloseRange);
		if (bSeesPlayer && (bSuspicious || Ctx.Tier > 0))
		{
			bSpotted = Ctx.Tier == 0;
			StartChase(P);
		}
		else
		{
			bSeesPlayer = false;
		}
	}

	if (bSeesPlayer)
	{
		LastKnownLocation = P;
		TimeOutOfSight = 0.f;
		if (Mode == EPursuerMode::Search)
		{
			SetMode(EPursuerMode::Chase);
		}
	}
	else if (IsChasing())
	{
		// The give-up clock only runs once they've actually seen him; before that they
		// follow dispatch's radio reports.
		if (Ctx.bContact)
		{
			TimeOutOfSight += DeltaSeconds;
		}
		// Reached the last sighting and he's gone: start combing the streets around it.
		if (Mode == EPursuerMode::Chase && Ctx.bContact && FVector::Dist2D(Cop->GetActorLocation(), LastKnownLocation) < ArriveRadius)
		{
			SetMode(EPursuerMode::Search);
		}
		if (TimeOutOfSight >= Cop->GiveUpTime)
		{
			SetMode(EPursuerMode::Patrol);
		}
	}
}

FVector AProhibitionCopController::GetDriveGoal()
{
	const AProhibitionCop* Cop = GetCop();
	const APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Cop || !Player)
	{
		return GetPawn() ? GetPawn()->GetActorLocation() : FVector::ZeroVector;
	}
	const FVector Here = Cop->GetActorLocation();
	const FVector P = Player->GetActorLocation();
	const float Dist = FVector::Dist2D(Here, P);
	const FShineHeatContext Ctx = GetHeatContext();

	auto Wander = [&](const FVector& Around, float Radius)
	{
		if (!bHasWanderGoal || FVector::Dist2D(Here, WanderGoal) < ArriveRadius)
		{
			WanderGoal = PickRoadPoint(Around, Radius);
			bHasWanderGoal = true;
		}
		return WanderGoal;
	};

	switch (Mode)
	{
	case EPursuerMode::Leave:
		return LeaveGoal;

	case EPursuerMode::Patrol:
		return Wander(P, PatrolRadius);

	default:
		if (bSeesPlayer || (Dist < CloseChase && !Ctx.bSafeZone))
		{
			// Direct pursuit. Zealots ram you head-on; Feds aim ahead to cut you off.
			FVector Target = P;
			if (Cop->Kind == EPursuerKind::Fed)
			{
				const float Lead = Dist < 1600.f ? 0.9f : FMath::Min(1.2f, Dist / 4000.f);
				Target += Player->GetVelocity() * Lead;
			}
			return Target;
		}
		if (Mode == EPursuerMode::Search)
		{
			return Wander(LastKnownLocation, SearchRadius);
		}
		// Before first contact dispatch radios Otto's live position; afterwards they only
		// know where they last saw him.
		return Ctx.bContact ? LastKnownLocation : P;
	}
}

float AProhibitionCopController::GetDesiredSpeed() const
{
	const AProhibitionCop* Cop = GetCop();
	if (!Cop)
	{
		return 0.f;
	}
	switch (Mode)
	{
	case EPursuerMode::Patrol: return Cop->MaxSpeed * 0.4f;
	case EPursuerMode::Search: return Cop->MaxSpeed * 0.7f;
	case EPursuerMode::Leave: return Cop->MaxSpeed * 0.8f;
	default:
	{
		// Three stars: pursuers get faster.
		const AMoonshineDeliveryManager* M = Manager.Get();
		return Cop->MaxSpeed * (M && M->GetTier() >= 3 ? ShineTuning::Tier3Boost : 1.f);
	}
	}
}

void AProhibitionCopController::DriveToward(const FVector& Goal, float Speed, float DeltaSeconds)
{
	AProhibitionCop* Cop = GetCop();
	if (!Cop)
	{
		return;
	}
	const FVector Here = Cop->GetActorLocation();

	// Follow the navmesh around buildings when there is one (re-planned twice a second or
	// when the goal moves); with no navmesh, drive straight at the goal.
	RepathTimer -= DeltaSeconds;
	if (RepathTimer <= 0.f || FVector::DistSquared2D(Goal, PathGoal) > FMath::Square(500.f))
	{
		RepathTimer = 0.5f;
		PathGoal = Goal;
		PathIndex = 0;
		Path.Reset();
		if (const UNavigationPath* NavPath = UNavigationSystemV1::FindPathToLocationSynchronously(this, Here, Goal, Cop))
		{
			if (NavPath->IsValid())
			{
				Path = NavPath->PathPoints;
			}
		}
	}
	while (PathIndex < Path.Num() && FVector::Dist2D(Here, Path[PathIndex]) < 800.f)
	{
		++PathIndex;
	}
	const FVector Aim = PathIndex < Path.Num() ? Path[PathIndex] : Goal;

	// Unreal: X is forward, Y is right, so a positive angle means "turn right".
	const FVector Local = Cop->GetActorTransform().InverseTransformPositionNoScale(Aim);
	const float Angle = static_cast<float>(FMath::Atan2(Local.Y, Local.X));
	float Steer = FMath::Clamp(Angle / 0.6f, -1.f, 1.f);

	// Slow down for sharp turns, like the web demo's cops.
	const float Sharpness = FMath::Clamp((FMath::Abs(Angle) - 0.3f) / 1.3f, 0.f, 1.f);
	const float Want = Speed * FMath::Lerp(1.f, 0.35f, Sharpness);
	const float Current = Cop->GetForwardSpeed();
	float Throttle = FMath::Clamp((Want - Current) / 300.f, 0.f, 1.f);
	float Brake = FMath::Clamp((Current - Want) / 300.f, 0.f, 1.f);

	Unstick(Throttle, Brake, Steer, DeltaSeconds);
	Cop->SetDriveInput(Throttle, Brake, Steer, false);
}

void AProhibitionCopController::StopDriving()
{
	if (AProhibitionCop* Cop = GetCop())
	{
		Cop->SetDriveInput(0.f, 0.f, 0.f, true);
	}
}

// Wedged against a wall: back up with the wheel turned the other way, then try again.
void AProhibitionCopController::Unstick(float& Throttle, float& Brake, float& Steer, float DeltaSeconds)
{
	const AProhibitionCop* Cop = GetCop();
	if (ReverseTime > 0.f)
	{
		ReverseTime -= DeltaSeconds;
		Throttle = 0.f;
		Brake = 1.f;          // brake reverses once stopped
		Steer = -Steer;
		return;
	}
	const bool bStalled = Throttle > 0.5f && Cop && FMath::Abs(Cop->GetForwardSpeed()) < 150.f;
	StuckTime = bStalled ? StuckTime + DeltaSeconds : 0.f;
	if (StuckTime > 1.5f)
	{
		StuckTime = 0.f;
		ReverseTime = 1.2f;
	}
}

bool AProhibitionCopController::HasLineOfSight(const AActor* Target) const
{
	const APawn* Cop = GetPawn();
	if (!Cop || !Target)
	{
		return false;
	}
	FCollisionQueryParams Params(SCENE_QUERY_STAT(ShineCopSight), false, Cop);
	FHitResult Hit;
	const FVector From = Cop->GetActorLocation() + FVector(0.f, 0.f, 150.f);
	const FVector To = Target->GetActorLocation() + FVector(0.f, 0.f, 100.f);
	if (!GetWorld()->LineTraceSingleByChannel(Hit, From, To, ECC_Visibility, Params))
	{
		return true;
	}
	return Hit.GetActor() == Target;   // buildings, walls and woods break the line
}

FVector AProhibitionCopController::PickRoadPoint(const FVector& Around, float Radius) const
{
	if (UNavigationSystemV1* Nav = UNavigationSystemV1::GetCurrent<UNavigationSystemV1>(GetWorld()))
	{
		FNavLocation Found;
		if (Nav->GetRandomPointInNavigableRadius(Around, Radius, Found))
		{
			return Found.Location;
		}
	}
	const FVector2D Offset = FMath::RandPointInCircle(Radius);
	return Around + FVector(Offset.X, Offset.Y, 0.f);
}

void AProhibitionCopController::WriteBlackboard()
{
	UBlackboardComponent* BB = GetBlackboardComponent();
	if (!BB)
	{
		return;
	}
	BB->SetValueAsObject(TargetKey, UGameplayStatics::GetPlayerPawn(this, 0));
	BB->SetValueAsBool(CanSeeKey, bSeesPlayer);
	BB->SetValueAsVector(LastKnownKey, LastKnownLocation);
	BB->SetValueAsEnum(ModeKey, static_cast<uint8>(Mode));
	BB->SetValueAsVector(DriveGoalKey, GetDriveGoal());
}
