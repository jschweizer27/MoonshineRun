#include "MoonshineDeliveryManager.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "MoonshineMarker.h"
#include "MoonshineRun.h"
#include "MoonshineVehicle.h"
#include "NavigationSystem.h"
#include "ProhibitionCop.h"
#include "ProhibitionCopController.h"

namespace
{
	// Cops the manager spawned (and may despawn). Cops you place by hand are never removed.
	const FName SpawnedTag(TEXT("ShineSpawned"));
	constexpr float PatrolSpawnMin = 16000.f;
	constexpr float PatrolSpawnMax = 38000.f;
	constexpr float PatrolDespawn = 48000.f;
	constexpr float JoinChaseRange = 26000.f;   // patrols this close join a new chase first
	constexpr float HideoutMaxSpeed = 900.f;    // roll in under ~20 mph to lie low
}

AMoonshineDeliveryManager::AMoonshineDeliveryManager()
{
	PrimaryActorTick.bCanEverTick = true;
	EvadeSeconds = { 0.f, 5.f, 7.f, 9.f };
}

AMoonshineDeliveryManager* AMoonshineDeliveryManager::Find(const UObject* WorldContext)
{
	UWorld* World = WorldContext ? WorldContext->GetWorld() : nullptr;
	if (!World)
	{
		return nullptr;
	}
	TActorIterator<AMoonshineDeliveryManager> It(World);
	return It ? *It : nullptr;
}

void AMoonshineDeliveryManager::BeginPlay()
{
	Super::BeginPlay();
	if (EvadeSeconds.Num() <= ShineTuning::MaxTier)
	{
		EvadeSeconds = { 0.f, 5.f, 7.f, 9.f };
	}
	if (StillSpots.IsEmpty())
	{
		CollectTagged(TEXT("Still"), StillSpots);
	}
	if (DropSpots.IsEmpty())
	{
		CollectTagged(TEXT("Drop"), DropSpots);
	}
	if (!Hideout)
	{
		TArray<TObjectPtr<AActor>> Found;
		CollectTagged(TEXT("Hideout"), Found);
		if (!Found.IsEmpty())
		{
			Hideout = Found[0];
		}
	}
	// Cops placed in the level by hand take part too.
	for (TActorIterator<AProhibitionCop> It(GetWorld()); It; ++It)
	{
		Cops.AddUnique(*It);
	}

	UClass* Class = MarkerClass ? MarkerClass.Get() : AMoonshineMarker::StaticClass();
	auto SpawnMarker = [this, Class](EShineMarkerKind Kind)
	{
		AMoonshineMarker* Marker = GetWorld()->SpawnActor<AMoonshineMarker>(Class, FTransform::Identity);
		if (Marker)
		{
			Marker->SetKind(Kind);
			Marker->SetShown(false);
		}
		return Marker;
	};
	PickupMarker = SpawnMarker(EShineMarkerKind::Still);
	DropMarker = SpawnMarker(EShineMarkerKind::Drop);
	HideoutMarker = SpawnMarker(EShineMarkerKind::Hideout);
	// The first still is placed on the first Tick, once Otto's truck has spawned.
}

void AMoonshineDeliveryManager::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	AMoonshineVehicle* Truck = GetTruck();
	if (!Truck)
	{
		return;
	}
	if (!bStarted)
	{
		StartRun(Truck);
	}
	const FVector P = Truck->GetActorLocation();

	UpdateLoop(Truck);
	const FShinePoliceReport Police = UpdatePolice(P);
	UpdateHeat(DeltaSeconds, Police);

	const int32 Tier = GetTier();
	if (Tier != PrevTier)
	{
		// New pursuers join only when the heat rises; losing a star just sends extras home.
		const bool bRising = Tier > PrevTier;
		PrevTier = Tier;
		SetPursuers(Tier, P, bRising);
		OnWantedChanged.Broadcast(Tier);
	}
	MaintainPatrols(DeltaSeconds, P);
	UpdateRoadblocks(DeltaSeconds, Truck);
	UpdateBust(DeltaSeconds, Police, Truck);
}

AMoonshineVehicle* AMoonshineDeliveryManager::GetTruck() const
{
	return Cast<AMoonshineVehicle>(UGameplayStatics::GetPlayerPawn(this, 0));
}

AProhibitionCopController* AMoonshineDeliveryManager::GetBrain(const AProhibitionCop* Cop) const
{
	return Cop ? Cast<AProhibitionCopController>(Cop->GetController()) : nullptr;
}

void AMoonshineDeliveryManager::StartRun(AMoonshineVehicle* Truck)
{
	bStarted = true;
	HomeTransform = Hideout ? Hideout->GetActorTransform() : Truck->GetActorTransform();
	if (Hideout && HideoutMarker)
	{
		HideoutMarker->SetActorLocation(HomeTransform.GetLocation());
		HideoutMarker->SetShown(true);
	}
	PlacePickup(Truck->GetActorLocation());
}

// ---- The bootlegger loop -------------------------------------------------------------

void AMoonshineDeliveryManager::UpdateLoop(AMoonshineVehicle* Truck)
{
	const FVector P = Truck->GetActorLocation();

	if (!bCarrying && PickupMarker && PickupMarker->IsShown() && FVector::Dist2D(P, PickupMarker->GetActorLocation()) < MarkerRadius)
	{
		bCarrying = true;
		Truck->bCarryingCargo = true;
		PickupMarker->SetShown(false);
		PlaceDrop(P);
		if (Order.bTipOff && Heat < 1.f)
		{
			Heat = 1.f;   // a big order: someone talked
			Suspicion = 0.f;
			Evade = 0.f;
		}
		OnPickedUp.Broadcast(CurrentPay);
	}
	else if (bCarrying && DropMarker && DropMarker->IsShown() && FVector::Dist2D(P, DropMarker->GetActorLocation()) < MarkerRadius)
	{
		bCarrying = false;
		Truck->bCarryingCargo = false;
		DropMarker->SetShown(false);
		Cash += CurrentPay;
		Streak += CurrentPay;
		++RunsCompleted;
		OnDelivered.Broadcast(CurrentPay);
		OnCashChanged.Broadcast(Cash);
		CurrentPay = 0;
		PlacePickup(P);
	}

	// Lying low: roll slowly into the hideout, empty and unseen, and the heat clears.
	const bool bAtHideout = FVector::Dist2D(P, HomeTransform.GetLocation()) < MarkerRadius;
	if (bAtHideout && !bCarrying && !bSeen && FMath::Abs(Truck->GetForwardSpeed()) < HideoutMaxSpeed && Heat > 0.f)
	{
		ClearHeat();
	}
}

void AMoonshineDeliveryManager::PlacePickup(const FVector& AwayFrom)
{
	FVector Spot;
	if (!PickupMarker || !PickSpot(StillSpots, AwayFrom, MinPickupDistance, Spot))
	{
		UE_LOG(LogShine, Warning, TEXT("Nowhere to put the still: tag an actor \"Still\" or add a Nav Mesh Bounds Volume (CHECKLIST.md, step 3)."));
		return;
	}
	StillLocation = Spot;
	PickupMarker->SetActorLocation(Spot);
	PickupMarker->SetShown(true);
}

void AMoonshineDeliveryManager::PlaceDrop(const FVector& From)
{
	if (!DropMarker)
	{
		return;
	}
	FVector Spot;
	if (!PickSpot(DropSpots, From, MinDropDistance, Spot))
	{
		UE_LOG(LogShine, Warning, TEXT("Nowhere to put the drop: tag an actor \"Drop\" or add a Nav Mesh Bounds Volume. Using the hideout."));
		Spot = HomeTransform.GetLocation();
	}
	DropMarker->SetActorLocation(Spot);
	DropMarker->SetShown(true);

	// Pay = jugs x price x (1 + distance / 900 m), rounded to $10.
	const float Distance = FVector::Dist2D(From, Spot);
	CurrentPay = FMath::RoundToInt(Order.Jugs * Order.PricePerJug * (1.f + Distance / ShineTuning::PayDistance) / 10.f) * 10;
}

// A spot at least MinDistance away (a random one among those far enough, else the
// farthest), or a random navigable point when no spots were placed.
bool AMoonshineDeliveryManager::PickSpot(const TArray<TObjectPtr<AActor>>& Spots, const FVector& AwayFrom, float MinDistance, FVector& Out) const
{
	TArray<FVector> FarEnough;
	FVector Farthest = FVector::ZeroVector;
	double FarthestDistance = -1.0;
	for (const AActor* Spot : Spots)
	{
		if (!IsValid(Spot))
		{
			continue;
		}
		const FVector Location = Spot->GetActorLocation();
		const double Distance = FVector::Dist2D(Location, AwayFrom);
		if (Distance >= MinDistance)
		{
			FarEnough.Add(Location);
		}
		if (Distance > FarthestDistance)
		{
			FarthestDistance = Distance;
			Farthest = Location;
		}
	}
	if (!FarEnough.IsEmpty())
	{
		Out = FarEnough[FMath::RandRange(0, FarEnough.Num() - 1)];
		return true;
	}
	if (FarthestDistance >= 0.0)
	{
		Out = Farthest;
		return true;
	}
	return RandomGroundPoint(AwayFrom, MinDistance, MinDistance * 1.6f, Out);
}

bool AMoonshineDeliveryManager::RandomGroundPoint(const FVector& Around, float MinDistance, float MaxDistance, FVector& Out) const
{
	for (int32 Try = 0; Try < 12; ++Try)
	{
		const float Angle = FMath::FRandRange(0.f, 2.f * PI);
		const float Distance = FMath::FRandRange(MinDistance, MaxDistance);
		FVector Point = Around + FVector(FMath::Cos(Angle) * Distance, FMath::Sin(Angle) * Distance, 0.f);
		if (ProjectToGround(Point))
		{
			Out = Point;
			return true;
		}
	}
	return false;
}

// Snap a point onto the navmesh (build it over your roads), or else onto whatever ground
// is below it.
bool AMoonshineDeliveryManager::ProjectToGround(FVector& InOut) const
{
	if (UNavigationSystemV1* Nav = UNavigationSystemV1::GetCurrent<UNavigationSystemV1>(GetWorld()))
	{
		FNavLocation Projected;
		if (Nav->ProjectPointToNavigation(InOut, Projected, FVector(2000.f, 2000.f, 5000.f)))
		{
			InOut = Projected.Location;
			return true;
		}
	}
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(ShineGround), false, GetTruck());
	if (GetWorld()->LineTraceSingleByChannel(Hit, InOut + FVector(0.f, 0.f, 10000.f), InOut - FVector(0.f, 0.f, 10000.f), ECC_Visibility, Params))
	{
		InOut = Hit.ImpactPoint;
		return true;
	}
	return false;
}

// In the camera's view and not hidden behind anything.
bool AMoonshineDeliveryManager::CanPlayerSee(const FVector& Location) const
{
	const APlayerCameraManager* Camera = UGameplayStatics::GetPlayerCameraManager(this, 0);
	if (!Camera)
	{
		return false;
	}
	const FVector Eye = Camera->GetCameraLocation();
	const FVector ToPoint = (Location - Eye).GetSafeNormal();
	const float HalfFov = FMath::DegreesToRadians(Camera->GetFOVAngle() * 0.5f + 10.f);
	if (FVector::DotProduct(Camera->GetCameraRotation().Vector(), ToPoint) < FMath::Cos(HalfFov))
	{
		return false;
	}
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(ShineSpawnSight), false, GetTruck());
	return !GetWorld()->LineTraceSingleByChannel(Hit, Eye, Location + FVector(0.f, 0.f, 150.f), ECC_Visibility, Params);
}

void AMoonshineDeliveryManager::CollectTagged(FName Tag, TArray<TObjectPtr<AActor>>& Out) const
{
	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		if (It->ActorHasTag(Tag))
		{
			Out.Add(*It);
		}
	}
}

AMoonshineMarker* AMoonshineDeliveryManager::GetObjective() const
{
	return bCarrying ? DropMarker.Get() : PickupMarker.Get();
}

FText AMoonshineDeliveryManager::GetObjectiveText() const
{
	return bCarrying
		? NSLOCTEXT("Shine", "ObjectiveDeliver", "Deliver the shine to the DROP")
		: NSLOCTEXT("Shine", "ObjectiveStill", "Drive to the STILL to load up");
}

// ---- Heat ----------------------------------------------------------------------------

int32 AMoonshineDeliveryManager::GetTier() const
{
	return FMath::Min(ShineTuning::MaxTier, FMath::FloorToInt(Heat + 1e-4f));
}

float AMoonshineDeliveryManager::EvadeTimeFor(int32 Tier) const
{
	return EvadeSeconds.IsValidIndex(Tier) ? FMath::Max(0.1f, EvadeSeconds[Tier]) : 7.f;
}

FShineHeatContext AMoonshineDeliveryManager::GetHeatContext() const
{
	FShineHeatContext Ctx;
	Ctx.bCarrying = bCarrying;
	Ctx.bSafeZone = bInSafeZone;
	Ctx.Tier = GetTier();
	Ctx.bContact = bContact;
	if (const AMoonshineVehicle* Truck = GetTruck())
	{
		Ctx.bDisguised = bCarrying && Truck->bDisguiseUnlocked && FMath::Abs(Truck->GetForwardSpeed()) < DisguiseSpeed;
	}
	return Ctx;
}

void AMoonshineDeliveryManager::UpdateHeat(float DeltaSeconds, const FShinePoliceReport& Police)
{
	const FShineHeatContext Ctx = GetHeatContext();
	const float Mult = bCarrying ? Order.HeatMultiplier : 1.f;
	auto FirstStar = [this]()
	{
		Heat = 1.f;
		Suspicion = 0.f;
		Evade = 0.f;
	};

	// Informants tip off the law while you haul (4x slower in disguise).
	if (bCarrying && Heat <= 0.f && !Ctx.bSafeZone)
	{
		Suspicion += TipOffRate * Mult * (Ctx.bDisguised ? DisguiseSuspicion : 1.f) * DeltaSeconds;
		if (Suspicion >= 1.f)
		{
			FirstStar();
		}
	}
	// A patrol spotted a suspicious truck.
	if (Police.bSpotted && Heat <= 0.f)
	{
		FirstStar();
	}

	if (Heat > 0.f)
	{
		if (Police.bSeen && !Ctx.bSafeZone)
		{
			// In sight while loaded: heat climbs toward 3 stars.
			Evade = 0.f;
			if (bCarrying)
			{
				Heat = FMath::Min(static_cast<float>(ShineTuning::MaxTier), Heat + BuildRateSeen * Mult * (Ctx.bDisguised ? 0.5f : 1.f) * DeltaSeconds);
			}
		}
		else if (bContact || !bCarrying || Ctx.bSafeZone)
		{
			// Out of every pursuer's sight: fill the evade meter and shed a star.
			const int32 Tier = FMath::Max(1, GetTier());
			Evade += DeltaSeconds / EvadeTimeFor(Tier) * (Ctx.bSafeZone ? 2.5f : 1.f);
			if (Evade >= 1.f)
			{
				Heat = static_cast<float>(Tier - 1);
				Evade = 0.f;
			}
		}
	}
}

void AMoonshineDeliveryManager::ClearHeat()
{
	Heat = 0.f;
	Suspicion = 0.f;
	Evade = 0.f;
	BustMeter = 0.f;
}

void AMoonshineDeliveryManager::UpdateBust(float DeltaSeconds, const FShinePoliceReport& Police, const AMoonshineVehicle* Truck)
{
	// Pinned: a pursuer right on you while you're nearly stopped. Grazes aren't a bust.
	const bool bPinned = Police.NearestChaser < PinRadius && FMath::Abs(Truck->GetForwardSpeed()) < PinSpeed;
	BustMeter = FMath::Clamp(BustMeter + (bPinned ? DeltaSeconds / BustTime : -DeltaSeconds * BustRecover), 0.f, 1.f);
	if (BustMeter >= 1.f)
	{
		Bust();
	}
}

void AMoonshineDeliveryManager::Bust()
{
	// Lose the cargo, pay a fine (10% of your cash, at least $100), continue from the hideout.
	const int32 Fine = FMath::Min(Cash, FMath::Max(100, FMath::RoundToInt(Cash * 0.1f)));
	Cash -= Fine;
	Streak = 0;
	bCarrying = false;
	CurrentPay = 0;
	if (DropMarker)
	{
		DropMarker->SetShown(false);
	}
	ClearHeat();
	PrevTier = 0;
	if (AMoonshineVehicle* Truck = GetTruck())
	{
		Truck->bCarryingCargo = false;
		Truck->ResetTo(HomeTransform);
		SetPursuers(0, Truck->GetActorLocation(), false);
		PlacePickup(HomeTransform.GetLocation());
	}
	OnWantedChanged.Broadcast(0);
	OnBusted.Broadcast(Fine);
	OnCashChanged.Broadcast(Cash);
}

// ---- Police --------------------------------------------------------------------------

FShinePoliceReport AMoonshineDeliveryManager::UpdatePolice(const FVector& PlayerLocation)
{
	FShinePoliceReport Report;
	for (int32 i = Cops.Num() - 1; i >= 0; --i)
	{
		AProhibitionCop* Cop = Cops[i];
		if (!IsValid(Cop))
		{
			Cops.RemoveAt(i);
			continue;
		}
		AProhibitionCopController* Brain = GetBrain(Cop);
		if (!Brain)
		{
			continue;
		}
		const float Distance = FVector::Dist2D(Cop->GetActorLocation(), PlayerLocation);
		const bool bOffScreen = !Cop->WasRecentlyRendered(0.5f);
		// Cars heading home vanish once out of view; so do patrols left far behind.
		const bool bGone = (Brain->Mode == EPursuerMode::Leave && ((Distance > DespawnDistance && bOffScreen) || Brain->ModeTime > 45.f))
			|| (Brain->Mode == EPursuerMode::Patrol && Distance > PatrolDespawn && bOffScreen);
		if (bGone && Cop->Tags.Contains(SpawnedTag))
		{
			Cop->Destroy();
			Cops.RemoveAt(i);
			continue;
		}
		const bool bSpottedNow = Brain->ConsumeSpotted();
		Report.bSpotted = Report.bSpotted || bSpottedNow;
		Report.bSeen = Report.bSeen || Brain->bSeesPlayer;
		if (Brain->IsChasing())
		{
			Report.NearestChaser = FMath::Min(Report.NearestChaser, Distance);
		}
	}
	bSeen = Report.bSeen;
	if (bSeen)
	{
		bContact = true;
	}
	return Report;
}

// Keep Count pursuers on Otto (recruiting only when bRecruit); extras head home. Nearby
// patrols join first.
void AMoonshineDeliveryManager::SetPursuers(int32 Count, const FVector& PlayerLocation, bool bRecruit)
{
	if (Count == 0)
	{
		bContact = false;
	}
	TArray<AProhibitionCopController*> Chasing;
	for (AProhibitionCop* Cop : Cops)
	{
		AProhibitionCopController* Brain = GetBrain(Cop);
		if (Brain && Brain->IsChasing())
		{
			Chasing.Add(Brain);
		}
	}
	while (bRecruit && Chasing.Num() < Count)
	{
		AProhibitionCopController* Recruit = nullptr;
		float RecruitDistance = JoinChaseRange;
		for (AProhibitionCop* Cop : Cops)
		{
			AProhibitionCopController* Brain = GetBrain(Cop);
			const float Distance = Cop ? FVector::Dist2D(Cop->GetActorLocation(), PlayerLocation) : 0.f;
			if (Brain && !Brain->IsChasing() && Distance < RecruitDistance)
			{
				Recruit = Brain;
				RecruitDistance = Distance;
			}
		}
		if (!Recruit)
		{
			static const EPursuerKind Pattern[] = { EPursuerKind::Fed, EPursuerKind::Zealot, EPursuerKind::Fed };
			Recruit = GetBrain(SpawnCop(Pattern[CopsSpawned % 3], SpawnMin, SpawnMax, PlayerLocation));
			if (!Recruit)
			{
				break;
			}
		}
		Recruit->StartChase(PlayerLocation);
		Chasing.Add(Recruit);
	}
	if (Chasing.Num() > Count)
	{
		Chasing.Sort([&PlayerLocation](const AProhibitionCopController& A, const AProhibitionCopController& B)
		{
			return FVector::DistSquared2D(A.GetPawn()->GetActorLocation(), PlayerLocation)
				> FVector::DistSquared2D(B.GetPawn()->GetActorLocation(), PlayerLocation);
		});
		for (int32 i = 0; i < Chasing.Num() - Count; ++i)
		{
			Chasing[i]->StartLeaving(PlayerLocation);
		}
	}
}

// Keep a couple of patrols cruising near Otto while he isn't wanted (none in a safe zone).
void AMoonshineDeliveryManager::MaintainPatrols(float DeltaSeconds, const FVector& PlayerLocation)
{
	PatrolTimer -= DeltaSeconds;
	if (GetTier() > 0 || bInSafeZone || PatrolTimer > 0.f)
	{
		return;
	}
	PatrolTimer = 1.f;
	int32 Patrols = 0;
	for (AProhibitionCop* Cop : Cops)
	{
		const AProhibitionCopController* Brain = GetBrain(Cop);
		Patrols += Brain && Brain->Mode == EPursuerMode::Patrol ? 1 : 0;
	}
	if (Patrols < PatrolCount)
	{
		SpawnCop(EPursuerKind::Fed, PatrolSpawnMin, PatrolSpawnMax, PlayerLocation);
	}
}

AProhibitionCop* AMoonshineDeliveryManager::SpawnCop(EPursuerKind Kind, float MinDistance, float MaxDistance, const FVector& PlayerLocation)
{
	TSubclassOf<AProhibitionCop> Class = (Kind == EPursuerKind::Zealot && ZealotClass) ? ZealotClass : FedClass;
	if (!Class)
	{
		Class = ZealotClass;
	}
	if (!Class)
	{
		if (!bWarnedNoCops)
		{
			UE_LOG(LogShine, Warning, TEXT("No pursuers: set Fed Class and Zealot Class on the Moonshine Delivery Manager (CHECKLIST.md, step 5)."));
			bWarnedNoCops = true;
		}
		return nullptr;
	}

	// Out of view (off-screen or behind something), between MinDistance and MaxDistance.
	FVector Spot;
	bool bFound = false;
	for (int32 Try = 0; Try < 24 && !bFound; ++Try)
	{
		bFound = RandomGroundPoint(PlayerLocation, MinDistance, MaxDistance, Spot) && !CanPlayerSee(Spot);
	}
	if (!bFound && !RandomGroundPoint(PlayerLocation, MinDistance, MaxDistance, Spot))
	{
		return nullptr;
	}
	const FRotator Facing(0.f, (PlayerLocation - Spot).Rotation().Yaw, 0.f);
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
	AProhibitionCop* Cop = GetWorld()->SpawnActor<AProhibitionCop>(Class, Spot + FVector(0.f, 0.f, 120.f), Facing, Params);
	if (!Cop)
	{
		return nullptr;
	}
	Cop->Kind = Class.Get() == ZealotClass.Get() ? EPursuerKind::Zealot : EPursuerKind::Fed;
	Cop->Tags.Add(SpawnedTag);
	if (!Cop->GetController())
	{
		Cop->SpawnDefaultController();
	}
	Cops.Add(Cop);
	++CopsSpawned;
	return Cop;
}

// At 2+ stars, parked sedans and sawhorses go up across the road ahead (one at 2 stars,
// two at 3), out of Otto's view.
void AMoonshineDeliveryManager::UpdateRoadblocks(float DeltaSeconds, const AMoonshineVehicle* Truck)
{
	Roadblocks.RemoveAll([](const TObjectPtr<AActor>& Block) { return !IsValid(Block.Get()); });
	const int32 Tier = GetTier();
	const int32 Wanted = Tier >= 2 ? Tier - 1 : 0;
	if (Wanted == 0)
	{
		for (AActor* Block : Roadblocks)
		{
			Block->Destroy();
		}
		Roadblocks.Reset();
		return;
	}
	RoadblockTimer -= DeltaSeconds;
	if (!RoadblockClass || Roadblocks.Num() >= Wanted || RoadblockTimer > 0.f)
	{
		return;
	}
	FVector Heading = Truck->GetVelocity().GetSafeNormal2D();
	if (Heading.IsNearlyZero())
	{
		Heading = Truck->GetActorForwardVector().GetSafeNormal2D();
	}
	for (int32 Try = 0; Try < 8; ++Try)
	{
		const FVector Direction = Heading.RotateAngleAxis(FMath::FRandRange(-35.f, 35.f), FVector::UpVector);
		FVector Spot = Truck->GetActorLocation() + Direction * FMath::FRandRange(12000.f, 16000.f);
		if (!ProjectToGround(Spot) || CanPlayerSee(Spot))
		{
			continue;
		}
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		const FRotator Across(0.f, Direction.Rotation().Yaw + 90.f, 0.f);
		if (AActor* Block = GetWorld()->SpawnActor<AActor>(RoadblockClass, Spot, Across, Params))
		{
			Roadblocks.Add(Block);
		}
		RoadblockTimer = Tier >= 3 ? 14.f : 20.f;
		return;
	}
	RoadblockTimer = 2.f;   // nowhere hidden yet; try again shortly
}
