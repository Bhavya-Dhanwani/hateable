// Importing modules
import ApiResponse from "../utils/ApiResponse.util.js";
import HTTP_STATUS from "../constants/StatusCodes.constants.js";

// function to send the API response
function NoContent(res, message = "No Content", data = null) {

    // sending the response with status code, message and data
    return ApiResponse(res, HTTP_STATUS.NO_CONTENT, message, data);

}

export default NoContent;
