"""HTTP adapter for the billing vertical slice."""

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.billing.errors import ProviderNotConfigured, RepositoryError
from backend.billing.service import BillingService, CreateCheckoutCommand, ProcessAdminRefundCommand



router = APIRouter(prefix="/v1/billing", tags=["billing"])


class PlanResponse(BaseModel):
    code: str
    display_name: str
    amount_cents: int
    currency: str
    terms_version: str


class CreateCheckoutRequest(BaseModel):
    plan_code: str = Field(min_length=1, max_length=100)
    terms_version: str = Field(min_length=1, max_length=100)
    recurring_consent: bool
    recurring_consent_version: str = Field(min_length=1, max_length=100)


class CheckoutResponse(BaseModel):
    order_id: str
    status: str
    expires_at: str
    redirect_url: str | None = None
    form_action: str | None = None
    form_fields: dict[str, str] | None = None

class OrderStatusResponse(BaseModel):
    id: str
    status: str
    paid_at: str | None
    expires_at: str
    can_resume: bool


class OrderHistoryResponse(BaseModel):
    id: str
    status: str
    kind: str
    amount_cents: int
    currency: str
    created_at: str
    paid_at: str | None
    expires_at: str


class BillingOverviewResponse(BaseModel):
    tier: str = "free"
    is_pro: bool = False
    subscription_id: str | None = None
    plan_code: str | None = None
    subscription_status: str | None = None
    current_period_ends_at: str | None = None
    next_charge_at: str | None = None
    cancel_at: str | None = None
    orders: list[OrderHistoryResponse]



class CancelSubscriptionResponse(BaseModel):
    subscription_id: str
    status: str
    current_period_ends_at: str
    cancel_at: str


class AdminRefundRequest(BaseModel):
    order_id: str = Field(min_length=1, max_length=100)
    amount_cents: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=500)


class AdminRefundResponse(BaseModel):
    refund_id: str
    order_id: str
    status: str
    amount_cents: int
    reason: str
    succeeded_at: str


class ReconciliationResponse(BaseModel):
    total_orders: int
    total_paid_cents: int
    total_refunded_cents: int
    active_subscriptions: int
    grace_subscriptions: int
    expired_subscriptions: int
    anomalies: list[dict[str, Any]]




def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    return token


def _service(request: Request) -> BillingService:
    service = getattr(request.app.state, "billing_service", None)
    if service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is unavailable")
    return service


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(request: Request):
    try:
        return await _service(request).list_plans()
    except RepositoryError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing plans are unavailable") from None


@router.post("/checkout-sessions", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def create_checkout_session(
    body: CreateCheckoutRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    idempotency_key: str | None = Header(default=None),
):
    if not idempotency_key or len(idempotency_key) > 255:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idempotency-Key is required")
    if not body.recurring_consent:
        raise HTTPException(status_code=422, detail="Recurring consent is required")
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        created = await _service(request).create_checkout(
            CreateCheckoutCommand(
                user_id=user_id,
                plan_code=body.plan_code,
                terms_version=body.terms_version,
                recurring_consent_version=body.recurring_consent_version,
                idempotency_key=idempotency_key,
            )
        )
    except ProviderNotConfigured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Checkout is not enabled") from None
    except RepositoryError as exc:
        code = status.HTTP_401_UNAUTHORIZED if str(exc) == "invalid authentication token" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail="Checkout could not be created") from None
    return CheckoutResponse(
        order_id=created.checkout.order_id,
        status=created.checkout.status,
        expires_at=created.checkout.expires_at.isoformat(),
        redirect_url=created.provider_session.redirect_url,
        form_action=created.provider_session.form_action,
        form_fields=created.provider_session.form_fields,
    )

@router.get("/orders/{order_id}", response_model=OrderStatusResponse)
async def get_order(order_id: str, request: Request, authorization: str | None = Header(default=None)):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None: raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        order = await _service(request).get_order(user_id, order_id)
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token": raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Order status unavailable") from None
    if order is None: raise HTTPException(status_code=404, detail="Order not found")
    return OrderStatusResponse(id=order.id,status=order.status,paid_at=order.paid_at.isoformat() if order.paid_at else None,expires_at=order.expires_at.isoformat(),can_resume=order.can_resume)


@router.get("/me", response_model=BillingOverviewResponse)
async def get_billing_overview(request: Request, authorization: str | None = Header(default=None)):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        service = _service(request)
        tier = await service.get_canonical_entitlement(user_id)
        overview = await service.get_overview(user_id)
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Billing overview unavailable") from None
    is_pro = (tier == "pro")
    if overview is None:
        return BillingOverviewResponse(tier=tier, is_pro=is_pro, orders=[])
    return BillingOverviewResponse(
        tier=tier,
        is_pro=is_pro,
        subscription_id=overview.subscription_id, plan_code=overview.plan_code,
        subscription_status=overview.subscription_status,
        current_period_ends_at=overview.current_period_ends_at.isoformat() if overview.current_period_ends_at else None,
        next_charge_at=overview.next_charge_at.isoformat() if overview.next_charge_at else None,
        cancel_at=overview.cancel_at.isoformat() if overview.cancel_at else None,
        orders=[OrderHistoryResponse(
            id=order.id, status=order.status, kind=order.kind,
            amount_cents=order.amount_cents, currency=order.currency,
            created_at=order.created_at.isoformat(),
            paid_at=order.paid_at.isoformat() if order.paid_at else None,
            expires_at=order.expires_at.isoformat(),
        ) for order in overview.orders],
    )



@router.post("/orders/{order_id}/resume", response_model=CheckoutResponse)
async def resume_checkout_session(
    order_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        resumed = await _service(request).resume_checkout(user_id, order_id)
    except ProviderNotConfigured:
        raise HTTPException(status_code=503, detail="Checkout is not enabled") from None
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Checkout unavailable") from None
    if resumed is None:
        raise HTTPException(status_code=404, detail="Order is not resumable")
    return CheckoutResponse(
        order_id=resumed.checkout.order_id,
        status=resumed.checkout.status,
        expires_at=resumed.checkout.expires_at.isoformat(),
        redirect_url=resumed.provider_session.redirect_url,
        form_action=resumed.provider_session.form_action,
        form_fields=resumed.provider_session.form_fields,
    )


@router.post("/subscription/cancel", response_model=CancelSubscriptionResponse)
async def cancel_subscription(
    request: Request,
    authorization: str | None = Header(default=None),
):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        result = await _service(request).cancel_subscription(user_id=user_id)
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        if "no active subscription" in str(exc).lower():
            raise HTTPException(status_code=404, detail="No active subscription found") from None
        raise HTTPException(status_code=503, detail="Cancellation unavailable") from None
    return CancelSubscriptionResponse(
        subscription_id=result.subscription_id,
        status=result.status,
        current_period_ends_at=result.current_period_ends_at.isoformat(),
        cancel_at=result.cancel_at.isoformat(),
    )


@router.post("/payuni/callback")
async def payuni_callback(request: Request):

    fields = {key: value for key, value in (await request.form()).items() if isinstance(value, str)}
    try:
        await _service(request).record_callback(fields)
    except (ProviderNotConfigured, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment callback") from None
    except RepositoryError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Callback persistence unavailable") from None
    return {"status": "accepted"}


admin_router = APIRouter(prefix="/v1/admin/billing", tags=["admin_billing"])


@admin_router.post("/refunds", response_model=AdminRefundResponse, status_code=status.HTTP_201_CREATED)
async def process_admin_refund(
    body: AdminRefundRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    idempotency_key: str | None = Header(default=None),
):
    if not idempotency_key or len(idempotency_key) > 255:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idempotency-Key is required")
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is unavailable")
    try:
        requested_by = await repository.authenticated_user_id(_bearer_token(authorization))
        result = await _service(request).process_admin_refund(
            ProcessAdminRefundCommand(
                order_id=body.order_id,
                amount_cents=body.amount_cents,
                reason=body.reason,
                requested_by=requested_by,
                idempotency_key=idempotency_key,
            )
        )
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        if "cannot refund non-paid order" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Order cannot be refunded") from None
        if "order not found" in str(exc).lower():
            raise HTTPException(status_code=404, detail="Order not found") from None
        raise HTTPException(status_code=503, detail="Refund processing unavailable") from None
    return AdminRefundResponse(
        refund_id=result.refund_id,
        order_id=result.order_id,
        status=result.status,
        amount_cents=result.amount_cents,
        reason=result.reason,
        succeeded_at=result.succeeded_at.isoformat(),
    )


@admin_router.get("/reconciliation", response_model=ReconciliationResponse)
async def get_reconciliation(
    request: Request,
    authorization: str | None = Header(default=None),
):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is unavailable")
    try:
        await repository.authenticated_user_id(_bearer_token(authorization))
        summary = await _service(request).get_reconciliation_summary()
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Reconciliation unavailable") from None
    return ReconciliationResponse(
        total_orders=summary.total_orders,
        total_paid_cents=summary.total_paid_cents,
        total_refunded_cents=summary.total_refunded_cents,
        active_subscriptions=summary.active_subscriptions,
        grace_subscriptions=summary.grace_subscriptions,
        expired_subscriptions=summary.expired_subscriptions,
        anomalies=summary.anomalies,
    )


