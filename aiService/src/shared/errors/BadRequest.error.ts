import ApiError from "../utils/ApiError.util.js";
import HTTP_STATUS from "../constants/StatusCodes.constants.js";

class BadRequest extends ApiError {

    constructor(message: string = "Bad Request") {

        // calling the parent class constructor
        super(HTTP_STATUS.BAD_REQUEST, message);

        // setting the message for the error
        this.message = message;

    }

}

export default BadRequest;
