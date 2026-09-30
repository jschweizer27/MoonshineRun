// ShineTypes.h: enums and structs shared by the vehicles, the police AI and the
// delivery loop.
#pragma once

#include "CoreMinimal.h"
#include "ShineTypes.generated.h"

// What a pursuer is doing. Mirrors the modes in the web demo's src/police.js.
UENUM(BlueprintType)
enum class EPursuerMode : uint8
{
	Patrol,   // cruising; reacts only to a truck that looks wrong
	Chase,    // on your tail (or driving to where they last saw you)
	Search,   // lost you; combing the streets around the last sighting
	Leave     // heat dropped; driving away to despawn out of view
};

UENUM(BlueprintType)
enum class EPursuerKind : uint8
{
	Fed UMETA(DisplayName = "Prohibition Fed"),        // aims ahead to cut you off
	Zealot UMETA(DisplayName = "Temperance zealot")    // drives straight at you to ram
};

UENUM(BlueprintType)
enum class EShineMarkerKind : uint8
{
	Still,
	Drop,
	Hideout
};

// Where the "Shine Pick Road Point" Behavior Tree task looks for a point.
UENUM(BlueprintType)
enum class EShinePointOrigin : uint8
{
	Self,
	Player,
	LastKnown UMETA(DisplayName = "Last known player location")
};

// One load of shine (the web demo's order book offers small / standard / big).
USTRUCT(BlueprintType)
struct FShineOrder
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Order")
	int32 Jugs = 24;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Order")
	int32 PricePerJug = 46;

	// How fast this load draws the law (web demo: small 1.0, standard 1.6, big 2.3).
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Order")
	float HeatMultiplier = 1.6f;

	// Big orders get you tipped off the moment you load up.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Order")
	bool bTipOff = false;
};

// What the police AI needs to know about Otto this frame. Built by the delivery manager.
USTRUCT(BlueprintType)
struct FShineHeatContext
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Heat")
	bool bCarrying = false;

	// Hauling under the disguise speed with the horse-box disguise unlocked.
	UPROPERTY(BlueprintReadOnly, Category = "Heat")
	bool bDisguised = false;

	// In a safe zone (the bribed sheriff's county): nobody can see you.
	UPROPERTY(BlueprintReadOnly, Category = "Heat")
	bool bSafeZone = false;

	// Wanted stars, 0..3.
	UPROPERTY(BlueprintReadOnly, Category = "Heat")
	int32 Tier = 0;

	// A pursuer has seen you since the chase began. Before that, dispatch radios your
	// live position; afterwards they only know where they last saw you.
	UPROPERTY(BlueprintReadOnly, Category = "Heat")
	bool bContact = false;
};
