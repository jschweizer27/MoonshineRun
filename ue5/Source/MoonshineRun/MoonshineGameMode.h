// MoonshineGameMode.h: wires the game together. Otto's truck is the default pawn, the
// HUD shows cash / stars / meters / objective, and a delivery manager is spawned if the
// level doesn't already have one. Make a Blueprint child to pick your truck Blueprint and
// a configured delivery manager (CHECKLIST.md, step 6).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "MoonshineGameMode.generated.h"

class AMoonshineDeliveryManager;

UCLASS()
class MOONSHINERUN_API AMoonshineGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AMoonshineGameMode();

	// Spawned when the level has no delivery manager of its own.
	UPROPERTY(EditAnywhere, Category = "Shine")
	TSubclassOf<AMoonshineDeliveryManager> DeliveryManagerClass;

	virtual void StartPlay() override;
};
