// MoonshineDeliveryManager.cpp — Dev Guide Phases 4 & 5
// SKELETON: not compiled here. Markers are left as TODO spawns; the loop and heat
// math match src/mission.js so the web demo's tuning carries over.
#include "MoonshineDeliveryManager.h"
#include "MoonshineVehicle.h"
#include "Kismet/GameplayStatics.h"

AMoonshineDeliveryManager::AMoonshineDeliveryManager()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AMoonshineDeliveryManager::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	APawn* Player = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Player) return;
	const FVector P = Player->GetActorLocation();

	// Pickup.
	if (!bCarrying && PickupMarker &&
		FVector::Dist(P, PickupMarker->GetActorLocation()) < PickupRadius)
	{
		bCarrying = true;
		if (AMoonshineVehicle* V = Cast<AMoonshineVehicle>(Player)) V->bCarryingCargo = true;
		PlaceDrop(P);
	}

	// Delivery.
	if (bCarrying && DropMarker &&
		FVector::Dist(P, DropMarker->GetActorLocation()) < DeliverRadius)
	{
		bCarrying = false;
		if (AMoonshineVehicle* V = Cast<AMoonshineVehicle>(Player)) V->bCarryingCargo = false;
		Cash += Reward;
		RunsCompleted++;
		OnCashChanged.Broadcast(Cash);
		PlacePickup();
	}

	UpdateHeat(DeltaSeconds);
}

void AMoonshineDeliveryManager::UpdateHeat(float DeltaSeconds)
{
	// Heat builds while carrying, cools while clean (see src/mission.js).
	Heat = bCarrying ? FMath::Min(3.f, Heat + 0.18f * DeltaSeconds)
	                 : FMath::Max(0.f, Heat - 0.45f * DeltaSeconds);

	const int32 NewLevel = FMath::RoundToInt(Heat);
	if (NewLevel != WantedLevel)
	{
		WantedLevel = NewLevel;
		OnWantedChanged.Broadcast(WantedLevel);
		// TODO: spawn/despawn AProhibitionCop pawns to match WantedLevel.
	}
}

void AMoonshineDeliveryManager::PlacePickup()
{
	// TODO: move/spawn PickupMarker at a random road node (amber beacon).
}

void AMoonshineDeliveryManager::PlaceDrop(const FVector& AwayFrom)
{
	// TODO: move/spawn DropMarker at a road node far from AwayFrom (blue beacon).
}
