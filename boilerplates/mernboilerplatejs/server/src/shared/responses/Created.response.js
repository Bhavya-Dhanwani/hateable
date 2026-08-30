// Importing modules
import ApiResponse from "../utils/ApiResponse.util.js";
import HTTP_STATUS from "../constants/StatusCodes.constants.js";

// function to send the API response
function Created(res, message = "Resource Created Successfully", data = null) {

    // sending the response with status code, message and data
    return ApiResponse(res, HTTP_STATUS.CREATED, message, data);

}

export default Created;
