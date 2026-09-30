#include "MoonshineGameMode.h"
#include "Engine/World.h"
#include "MoonshineDeliveryManager.h"
#include "MoonshineHUD.h"
#include "MoonshineVehicle.h"

AMoonshineGameMode::AMoonshineGameMode()
{
	DefaultPawnClass = AMoonshineVehicle::StaticClass();
	HUDClass = AMoonshineHUD::StaticClass();
	DeliveryManagerClass = AMoonshineDeliveryManager::StaticClass();
}

void AMoonshineGameMode::StartPlay()
{
	Super::StartPlay();
	if (!AMoonshineDeliveryManager::Find(this))
	{
		UClass* Class = DeliveryManagerClass ? DeliveryManagerClass.Get() : AMoonshineDeliveryManager::StaticClass();
		GetWorld()->SpawnActor<AMoonshineDeliveryManager>(Class, FTransform::Identity);
	}
}
