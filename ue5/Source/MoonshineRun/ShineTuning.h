// ShineTuning.h: default gameplay numbers, copied from the web demo's src/config.js so a
// feel tuned in the browser carries straight over. Unreal works in centimetres, so every
// distance and speed is the web value x 100. Each one is also an editable property on the
// actor that uses it; change it there (or in a Blueprint child) rather than here.
#pragma once

#include "CoreMinimal.h"

namespace ShineTuning
{
	constexpr float CmPerSecToMph = 0.0223694f;

	// Police (config.police)
	constexpr float CopMaxSpeed = 3500.f;        // 35 m/s, ~78 mph
	constexpr float SightRange = 7000.f;         // needs a clear line of sight too
	constexpr float CloseRange = 1500.f;         // patrols see through the disguise this close
	constexpr float GiveUpTime = 10.f;           // Dev Guide: a cop gives up after ~10 s out of sight
	constexpr float SpawnMin = 15000.f;          // pursuers appear out of view, this far away
	constexpr float SpawnMax = 26000.f;
	constexpr float DespawnDistance = 11000.f;   // leaving cars vanish once off-screen and this far
	constexpr float PinRadius = 750.f;           // busted: a pursuer this close...
	constexpr float PinSpeed = 400.f;            // ...while you're slower than ~9 mph...
	constexpr float BustTime = 2.f;              // ...for this long
	constexpr float BustRecover = 0.8f;          // bust bar drains this fast once you break free
	constexpr float Tier3Boost = 1.18f;          // 3 stars: pursuers get faster
	constexpr int32 PatrolCount = 2;

	// Heat (config.heat)
	constexpr int32 MaxTier = 3;
	constexpr float TipOffRate = 0.06f;          // informants: suspicion per second while hauling
	constexpr float BuildRateSeen = 0.1f;        // heat per second while a pursuer can see you
	constexpr float DisguiseSpeed = 1340.f;      // horse-box disguise works under 30 mph
	constexpr float DisguiseSuspicion = 0.25f;   // suspicion builds 4x slower while disguised

	// The garage's 1925 Rolls-Royce (config.rolls): faster and less suspicious, but no horse
	// box (no disguise, no armour) and the trunk takes small loads only.
	constexpr int32 RollsCost = 8000;
	constexpr float RollsSpeed = 1.15f;          // top speed multiplier
	constexpr float RollsAccel = 1.1f;
	constexpr float RollsSuspicion = 0.6f;       // tip-offs build this much as fast
	constexpr int32 RollsTrunkJugs = 24;

	// Mission (config.mission)
	constexpr float MarkerRadius = 700.f;
	constexpr float MinPickupDistance = 15000.f; // stills never appear on top of you
	constexpr float MinDropDistance = 18000.f;   // buyers are across town
	constexpr float PayDistance = 90000.f;       // pay = jugs x price x (1 + distance / 900 m)
	// Act I escape (config.mission.escape; the escape itself isn't built in UE5 yet): the
	// zealots start this far behind and hold back this long so the player can get moving.
	constexpr float EscapeGap = 5000.f;
	constexpr float EscapeHeadStart = 2.5f;
}
