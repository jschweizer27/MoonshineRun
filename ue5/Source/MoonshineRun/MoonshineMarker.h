// MoonshineMarker.h: Dev Guide Phase 4. A glowing column you can see over the rooftops,
// labelled so it isn't told apart by colour alone: amber STILL, blue DROP, green HIDEOUT.
// Works with no assets (engine cylinder + light + text); restyle it in a Blueprint child
// and set that as the delivery manager's Marker Class.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ShineTypes.h"
#include "MoonshineMarker.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;
class UTextRenderComponent;

UCLASS()
class MOONSHINERUN_API AMoonshineMarker : public AActor
{
	GENERATED_BODY()

public:
	AMoonshineMarker();

	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION(BlueprintCallable, Category = "Marker")
	void SetKind(EShineMarkerKind NewKind);

	UFUNCTION(BlueprintCallable, Category = "Marker")
	void SetShown(bool bShown);

	UFUNCTION(BlueprintPure, Category = "Marker")
	bool IsShown() const { return !IsHidden(); }

	UPROPERTY(BlueprintReadOnly, Category = "Marker")
	EShineMarkerKind Kind = EShineMarkerKind::Still;

	// Restyle per kind in Blueprint.
	UFUNCTION(BlueprintImplementableEvent, Category = "Marker")
	void OnKindChanged(EShineMarkerKind NewKind);

protected:
	UPROPERTY(VisibleAnywhere, Category = "Marker")
	TObjectPtr<UStaticMeshComponent> Beam;

	UPROPERTY(VisibleAnywhere, Category = "Marker")
	TObjectPtr<UPointLightComponent> Glow;

	UPROPERTY(VisibleAnywhere, Category = "Marker")
	TObjectPtr<UTextRenderComponent> Label;
};
