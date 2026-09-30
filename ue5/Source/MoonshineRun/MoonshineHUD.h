// MoonshineHUD.h: Dev Guide Phase 5. A working HUD drawn in code, so the loop is readable
// before any UMG widgets exist: cash, wanted stars, the suspicion / heat / evade meter,
// the bust bar, the objective with distance, speed, and pop-up messages (+$ on delivery,
// BUSTED, stars gained or lost). Replace it with UMG widgets bound to the delivery
// manager's properties and events whenever you like.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "MoonshineHUD.generated.h"

class AMoonshineDeliveryManager;

UCLASS()
class MOONSHINERUN_API AMoonshineHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

protected:
	UFUNCTION() void HandleDelivered(int32 Pay);
	UFUNCTION() void HandleBusted(int32 Fine);
	UFUNCTION() void HandleWantedChanged(int32 NewLevel);

private:
	void ShowMessage(const FString& Text, const FLinearColor& Color, float Seconds = 2.5f);
	void DrawBar(float X, float Y, float Width, float Height, float Fill, const FLinearColor& Color);

	TWeakObjectPtr<AMoonshineDeliveryManager> Manager;
	FString Message;
	FLinearColor MessageColor = FLinearColor::White;
	float MessageUntil = 0.f;
	int32 ShownTier = 0;
};
