async function buildTokenPayload(user) {
    const u = user;
    const tokenPayload = {
        _id: u._id,
        userId: u._id.toString(),
        name: u.name,
        email: u.email,
        isVerified: u.isVerified,
    };
    return tokenPayload;
}

export default buildTokenPayload;
