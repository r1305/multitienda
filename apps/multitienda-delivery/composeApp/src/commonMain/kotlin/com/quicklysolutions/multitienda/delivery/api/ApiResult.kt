package com.quicklysolutions.multitienda.delivery.api

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>

    data class Fail(val kind: Kind, val message: String) : ApiResult<Nothing>

    enum class Kind { NETWORK, UNAUTHORIZED, FORBIDDEN, CONFLICT, INVALID, HTTP }
}
