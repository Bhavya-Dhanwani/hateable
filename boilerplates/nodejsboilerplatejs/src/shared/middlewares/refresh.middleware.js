// Importing modules
import jwt from "jsonwebtoken";
import env from "../config/env.config.js";
import Unauthorized from "../errors/Unauthorized.error.js";

// function to get the refresh token from the cookie
function getRefreshTokenFromCookie(req, res, next) {

    // getting the refresh token from the cookie
    const refreshToken = req.cookies?.refreshToken;

    // if the refresh token is not present, return an error
    if (!refreshToken) {

        // if the refresh token is not present, throw an unauthorized error
        throw new Unauthorized("Refresh token not found in cookie.");

    }

    // decoding the refresh token to check if it is valid
    try {

        // verifying the refresh token
        const decoded = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET);

        // if the refresh token is valid, attach the decoded user to the request object
        req.session = decoded;

    } catch (error) {

        // if the refresh token is invalid, return an error
        throw new Unauthorized("Refresh token expired or invalid.");

    }

    // if the refresh token is present, attach it to the request object
    req.refreshToken = refreshToken;

    next();

}

export default getRefreshTokenFromCookie;
